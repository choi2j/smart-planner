from supabase import create_client, Client
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import google.generativeai as genai
import os
import json


# FastAPI 앱 초기화
app = FastAPI(
    title="SMART-PLANNER-API",
    description="SMART-PLANNER-API 백엔드 with Google OAuth",
    version="2.0.0"
)

# Gemini API 설정
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyCCnfrRNMsL0eHrxpXTpdw34I2oWjx-ua4")
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.0-flash")

# Supabase 클라이언트 설정
SUPABASE_URL = "https://hbypjezxxkevgbzkhjgj.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhieXBqZXp4eGtldmdiemtoamdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzMjQzNTQsImV4cCI6MjA3ODkwMDM1NH0.933VwKz3oMEqppYQXN9n8fA58iV2aBpIA8RUGQTSwM0"

supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 프로덕션에서는 특정 도메인으로 제한하세요
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Pydantic Models ====================

class TestModel(BaseModel):
    testmsg: str

class RepTest(BaseModel):
    retmsg: str

class TodoItem(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    location: Optional[str] = None
    priority: Optional[str] = "medium"
    status: bool = False

class TodoResponse(BaseModel):
    original_message: str
    todos: List[TodoItem]
    todo_count: int

class TodoRequest(BaseModel):
    message: str

class AuthRequest(BaseModel):
    access_token: str

class UserResponse(BaseModel):
    user_id: str
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None


# ==================== Auth Helper Functions ====================

async def get_current_user(authorization: str = None):
    """인증 토큰에서 현재 사용자 정보 가져오기"""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing"
        )
    
    try:
        # Bearer 토큰에서 실제 토큰 추출
        token = authorization.replace("Bearer ", "")
        
        # Supabase에서 사용자 정보 가져오기
        user_response = supabase_client.auth.get_user(token)
        
        if not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token"
            )
        
        return user_response.user
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )


# ==================== Health Check ====================

@app.get("/")
async def root():
    """API 상태 확인"""
    return {
        "status": "running",
        "message": "AI Todo List API with Google OAuth",
        "version": "2.0.0",
        "endpoints": {
            "auth": [
                "/auth/google",
                "/auth/callback",
                "/auth/verify",
                "/auth/logout"
            ],
            "todos": [
                "/todo-request",
                "/send-todo",
                "/get-todos",
                "/update-todo/{todo_id}",
                "/delete-todo/{todo_id}"
            ]
        }
    }


# ==================== Test Endpoint ====================

@app.post("/test", response_model=RepTest)
async def test_endpoint(request: TestModel):
    """테스트 엔드포인트"""
    return RepTest(retmsg=request.testmsg)


# ==================== Authentication Endpoints ====================

@app.get("/auth/google")
async def google_login():
    """
    Google OAuth 로그인 시작
    프론트엔드에서 직접 Supabase 클라이언트를 사용하는 것을 권장합니다.
    """
    return {
        "message": "Please use Supabase client in frontend for OAuth",
        "example": {
            "supabase_url": SUPABASE_URL,
            "provider": "google",
            "method": "supabase.auth.signInWithOAuth({ provider: 'google' })"
        }
    }


@app.post("/auth/verify")
async def verify_token(auth_request: AuthRequest):
    """
    액세스 토큰 검증 및 사용자 정보 반환
    """
    try:
        user_response = supabase_client.auth.get_user(auth_request.access_token)
        
        if not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        user = user_response.user
        
        return UserResponse(
            user_id=user.id,
            email=user.email,
            name=user.user_metadata.get("full_name") or user.user_metadata.get("name"),
            avatar_url=user.user_metadata.get("avatar_url")
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {str(e)}"
        )


@app.post("/auth/logout")
async def logout(authorization: str = None):
    """
    로그아웃 (토큰 무효화)
    Header: Authorization: Bearer <token>
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing"
        )
    
    try:
        token = authorization.replace("Bearer ", "")
        supabase_client.auth.sign_out()
        
        return {"message": "Successfully logged out"}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Logout failed: {str(e)}"
        )


# ==================== AI Todo Parsing ====================

TODO_EXTRACTION_PROMPT = """당신은 사용자의 평문 메시지를 분석하여 할 일(Todo) 목록으로 변환하는 AI 어시스턴트입니다.

사용자 메시지: "{message}"

위 메시지를 분석하여 할 일 목록을 추출하세요. 다음 JSON 형식으로만 응답하세요:

{{
    "todos": [
        {{
        "title": "할 일 제목 (간결하게)",
        "description": "할 일에 대한 상세 설명",
        "due_date": "마감일 (YYYY-MM-DD 형식, 언급된 경우만, 없을경우 null)",
        "due_time": "마감날의 정확한 시간(HH:MM 형식, 언급된 경우만, 없을경우 null)",
        "location": "장소 (언급된 경우만, 없을경우 null)",
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
5. 반드시 유효한 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.
6. null 값은 문자열이 아닌 JSON null로 표현하세요.

예시:
사용자: "내일까지 10시까지 회사에서 보고서 작성하고, 장 봐야 해. 우유랑 계란 사야 함"
응답:
{{
    "todos": [
        {{
            "title": "보고서 작성",
            "description": "내일까지 완료해야 하는 회사 보고서",
            "due_date": "2025-11-19",
            "due_time": "10:00",
            "location": "회사",
            "priority": "high",
            "status": false
        }},
        {{
            "title": "장 보기",
            "description": "우유와 계란을 사야함",
            "due_date": null,
            "due_time": null,
            "location": null,
            "priority": "medium",
            "status": false
        }}
    ]
}}"""


@app.post("/todo-request", response_model=TodoResponse)
async def parse_todo(request: TodoRequest):
    """
    AI를 사용하여 자연어 메시지를 Todo 목록으로 변환
    """
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        prompt = TODO_EXTRACTION_PROMPT.format(
            message=request.message,
            today=today
        )
        
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        # JSON 마크다운 코드 블록 제거
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        
        response_text = response_text.strip()
        
        # JSON 파싱
        parsed_data = json.loads(response_text)
        todos = [TodoItem(**todo) for todo in parsed_data.get("todos", [])]
        
        return TodoResponse(
            original_message=request.message,
            todos=todos,
            todo_count=len(todos)
        )
        
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"AI 응답을 파싱하는 중 오류가 발생했습니다: {str(e)}\n응답: {response_text}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Todo 파싱 중 오류 발생: {str(e)}"
        )


# ==================== Todo CRUD Operations ====================

@app.post('/send-todo')
async def send_todo(data: TodoItem):
    """
    Todo를 데이터베이스에 저장
    인증이 필요한 경우 get_current_user를 Depends로 추가하세요
    """
    try:
        response = supabase_client.table("test").insert({
            "title": data.title,
            "description": data.description,
            "due_date": data.due_date,
            "due_time": data.due_time,
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


@app.get('/get-todos')
async def get_todos():
    """
    모든 Todo 가져오기
    """
    try:
        response = supabase_client.table("test").select("*").execute()
        return {"success": True, "data": response.data, "count": len(response.data)}
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Todo 조회 중 오류 발생: {str(e)}"
        )


@app.put('/update-todo/{todo_id}')
async def update_todo(todo_id: int, data: TodoItem):
    """
    Todo 업데이트
    """
    try:
        response = supabase_client.table("test").update({
            "title": data.title,
            "description": data.description,
            "due_date": data.due_date,
            "due_time": data.due_time,
            "location": data.location,
            "priority": data.priority,
            "status": data.status
        }).eq("id", todo_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Todo not found")
        
        return {"success": True, "data": response.data}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Todo 업데이트 중 오류 발생: {str(e)}"
        )


@app.delete('/delete-todo/{todo_id}')
async def delete_todo(todo_id: int):
    """
    Todo 삭제
    """
    try:
        response = supabase_client.table("test").delete().eq("id", todo_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Todo not found")
        
        return {"success": True, "message": "Todo deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Todo 삭제 중 오류 발생: {str(e)}"
        )

