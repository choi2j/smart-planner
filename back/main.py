from supabase import create_client, Client
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import google.generativeai as genai
import os
import json
from dotenv import load_dotenv

load_dotenv()

# reset
app = FastAPI(
    title="SMART-PLANNER-API",
    description="SMART-PLANNER-API 백엔드",
    version="1.0.0"
)

# gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "your-api-key-here")
genai.configure(api_key=GEMINI_API_KEY)

model = genai.GenerativeModel('gemini-pro')

# db
supabase_client: Client = create_client("https://hbypjezxxkevgbzkhjgj.supabase.co/",
                                        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhieXBqZXp4eGtldmdiemtoamdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMjQzNTQsImV4cCI6MjA3ODkwMDM1NH0.933VwKz3oMEqppYQXN9n8fA58iV2aBpIA8RUGQTSwM0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# default status
@app.get("/")
async def root():
    return {
        "status": "running",
        "message": "AI Todo List API",
        "version": "1.0.0"
    }

# AI - fucking god damn

# prompt
TODO_EXTRACTION_PROMPT = """당신은 사용자의 평문 메시지를 분석하여 할 일(Todo) 목록으로 변환하는 AI 어시스턴트입니다.

사용자 메시지: "{message}"

위 메시지를 분석하여 할 일 목록을 추출하세요. 다음 JSON 형식으로만 응답하세요:

{{
    "todos": [
        {{
        "title": "할 일 제목 (간결하게)",
        "description": "할 일에 대한 상세 설명",
        "due_date": "마감일 (YYYY-MM-DD 형식, 언급된 경우만 없을경우 null)",
        "due_time": "마감날의 정확한 시간(HH:MM 형식, 언급된 경우만 없을경우 null)",
        "priority": "low/medium/high 중 하나",
        "status": false
        }}
    ]
}}

규칙:
1. 메시지에서 명시적이거나 암시적인 모든 할 일을 추출하세요.
2. 우선순위는 맥락에 따라 판단하세요 (급함/중요함 = high, 일반적 = medium, 여유 = low).
3. 날짜가 "내일", "다음주", "이번주 금요일" 등으로 표현된 경우 구체적인 날짜로 변환하세요 (오늘은 {today}).
4. description은 원래 메시지의 맥락을 포함하여 작성하세요.
5. 카테고리는 내용을 보고 적절히 분류하세요.
6. 반드시 유효한 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

예시:
사용자: "내일까지 10시까지 회사보고서 작성하고, 장 봐야 해. 우유랑 계란 사야 함"
응답:
{{
    "todos": [
        {{
            "title": "보고서 작성",
            "description": "내일까지 완료해야 하는 보고서",
            "due_date": "2025-11-18",
            "due_time": "10:00",
            "location": "회사",
            "priority": "high",
            "status": false
        }},
        {{
            "title": "장 보기",
            "description": "우유와 계란을 사야함함",
            "due_date": "null",
            "due_time": "null",
            "location": "null",
            "priority": "middle",
            "status": false
        }}
    ]
}}"""

# request json model
class TodoItem(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    location: Optional[str] = None
    priority: Optional[str] = "medium"  # low, medium, high
    status: bool = False

# responese data model
class TodoResponse(BaseModel):
    original_message: str
    todos: List[TodoItem]

# request data model
class TodoRequest(BaseModel):
    message: str

@app.post("/todo-request", response_model=TodoResponse)
async def parse_todo(request: TodoRequest):
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        prompt = TODO_EXTRACTION_PROMPT.format(
            message=request.message,
            today=today
        )
        response = model.generate_content(prompt)
        response_text = response.text.strip()

        # --- 여기부터 수정 ---

        # 1. AI 응답에서 JSON 부분만 정확히 추출합니다.
        try:
            # 가장 처음 여는 중괄호({)의 위치를 찾습니다.
            start_index = response_text.find('{')
            # 가장 마지막 닫는 중괄호(})의 위치를 찾습니다.
            end_index = response_text.rfind('}') + 1
            
            # 중괄호를 찾은 경우에만 해당 부분을 잘라냅니다.
            if start_index != -1 and end_index != -1:
                json_string = response_text[start_index:end_index]
            else:
                # AI 응답에 JSON이 아예 없는 경우
                raise ValueError("AI 응답에서 유효한 JSON 객체를 찾을 수 없습니다.")
                
        except Exception as e:
            # 추출 실패 시 오류를 발생시켜 JSONDecodeError로 잡히도록 합니다.
            # 이 로그는 서버 터미널에만 보입니다.
            print(f"JSON 서브셋 추출 실패: {e}\n원본 응답: {response_text}")
            raise json.JSONDecodeError("Failed to extract JSON subset", response_text, 0)
        
        # 2. 추출한 문자열로 JSON 파싱 시도
        parsed_data = json.loads(json_string)

        # --- 여기까지 수정 ---

        # TodoItem 객체로 변환
        todos = [TodoItem(**todo) for todo in parsed_data.get("todos", [])]
        return TodoResponse(
            original_message=request.message,
            todos=todos
        )
        
    # error1 jsondecode
    except json.JSONDecodeError as e:
        # 추출이 실패했거나, 추출된 내용이 여전히 유효한 JSON이 아닌 경우
        raise HTTPException(
            status_code=501,
            # 'json_string'이 정의되었을 수도 있으니 원본 응답(response_text)을 로깅
            detail=f"AI 응답을 파싱하는 중 오류가 발생했습니다: {str(e)}\n응답: {response_text}"
        )
    # error2 http
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Todo 파싱 중 오류 발생: {str(e)}"
        )
    

class testmodel(BaseModel):
    testmsg: str
class reptest(BaseModel):
    retmsg: str

@app.post("/test", response_model=reptest)
async def parse_todo(request: testmodel):
    # 'reptest' 모델과 일치하는 딕셔너리(dict)를 반환합니다.
    return {"retmsg": request.testmsg}