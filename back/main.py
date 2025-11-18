from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import google.generativeai as genai
import json
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pydantic_settings import BaseSettings
import httpx

load_dotenv()

# 설정 클래스
class Settings(BaseSettings):
    frontend_url: str
    supabase_url: str
    supabase_anon_key: str
    gemini_api_key: str
    
    class Config:
        env_file = ".env"

settings = Settings()

# reset
app = FastAPI(
    title="SMART-PLANNER-API",
    description="SMART-PLANNER-API 백엔드",
    version="1.0.0"
)
security = HTTPBearer()

# gemini
genai.configure(api_key=settings.gemini_api_key)
model = genai.GenerativeModel("gemini-2.0-flash")

# db
supabase_client: Client = create_client(
    settings.supabase_url,
    settings.supabase_anon_key
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== Auth ====================

supabase_client.auth.signInWithOAuth({
    provider: 'google',
})


# ==================== 기존 엔드포인트 ====================

# default status
@app.get("/")
async def root():
    return {
        "status": "running",
        "message": "AI Todo List API",
        "version": "1.0.0"
    }

# default
class testmodel(BaseModel):
    testmsg: str

class reptest(BaseModel):
    retmsg: str

@app.post("/test", response_model=reptest)
async def parse_todo(request: testmodel):
    return request.testmsg

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
        "location": "해당 행동이 행해져야하는 위치",
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
7. 특정한 위치나 행동의 주체가 실행되어야하는 곳이 문장에 포함되어있을경우 location에 저장하세요

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
    todo_count: int

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
        
        # JSON parsing
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        
        response_text = response_text.strip()
        
        parsed_data = json.loads(response_text)

        todos = [TodoItem(**todo) for todo in parsed_data.get("todos", [])]
        return TodoResponse(
            original_message=request.message,
            todos=todos,
            todo_count=len(todos) 
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

# Save DB
@app.post('/send-Todo')
async def sendTodoList(data: TodoItem, current_user = Depends(get_current_user)):
    """인증된 사용자의 Todo 저장"""
    try:
        response = supabase_client.table("test").insert({
            "user_id": current_user.id,  # 인증된 사용자 ID 사용
            "title": data.title,
            "description": data.description,
            "event_date": data.due_date,
            "event_time": data.due_time,
            "location": data.location,
            "priority": data.priority,
            "status": data.status
        }).execute()
        return {"success": True, "data": response.data}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Todo 저장 중 오류 발생: {str(e)}"
        )

# ==================== Todos Save/Load ====================

class SaveTodoRequest(BaseModel):
    todos: List[TodoItem]

@app.post('/todos/save')
async def save_todos(request: SaveTodoRequest, current_user = Depends(get_current_user)):
    """사용자의 모든 할 일을 데이터베이스에 저장"""
    try:
        user_id = current_user.id

        # 기존 todos 삭제
        supabase_client.table("todos").delete().eq("user_id", user_id).execute()

        # 새로운 todos 삽입
        todos_data = []
        for todo in request.todos:
            todos_data.append({
                "user_id": user_id,
                "title": todo.title,
                "description": todo.description,
                "due_date": todo.due_date,
                "due_time": todo.due_time,
                "location": todo.location,
                "priority": todo.priority,
                "status": todo.status
            })

        if todos_data:
            supabase_client.table("todos").insert(todos_data).execute()

        return {"message": "Todos saved successfully", "count": len(todos_data)}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save todos: {str(e)}"
        )

@app.get('/todos/load', response_model=List[TodoItem])
async def load_todos(current_user = Depends(get_current_user)):
    """사용자의 모든 할 일을 데이터베이스에서 로드"""
    try:
        user_id = current_user.id

        response = supabase_client.table("todos").select("*").eq("user_id", user_id).execute()

        todos = []
        for item in response.data:
            todos.append(TodoItem(
                title=item["title"],
                description=item["description"],
                due_date=item["due_date"],
                due_time=item["due_time"],
                location=item["location"],
                priority=item["priority"],
                status=item["status"]
            ))

        return todos
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load todos: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
