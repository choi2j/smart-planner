from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import google.generativeai as genai
import os
import json
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pydantic_settings import BaseSettings

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

# ==================== 인증 미들웨어 ====================
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """JWT 토큰 검증 및 현재 사용자 정보 반환"""
    try:
        token = credentials.credentials
        
        # Supabase에서 사용자 정보 가져오기
        response = supabase_client.auth.get_user(token)
        
        if not response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return response.user
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# ==================== 인증 관련 엔드포인트 ====================

# Pydantic 모델
class OAuthLoginRequest(BaseModel):
    provider: str  # 'google', 'github', 'kakao' etc.

class RefreshTokenRequest(BaseModel):
    refresh_token: str

# OAuth 로그인
@app.post("/auth/oauth/login")
async def oauth_login(request: OAuthLoginRequest):
    """OAuth 로그인 URL 생성"""
    try:
        data = supabase_client.auth.sign_in_with_oauth({
            "provider": request.provider,
            "options": {
                "redirect_to": f"{settings.frontend_url}/auth/callback"
            }
        })
        return {"url": data.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# OAuth 콜백 처리
@app.get("/auth/callback")  # ← GET으로 변경
async def auth_callback(code: str):
    """OAuth 콜백 처리"""
    try:
        # 올바른 방법: 딕셔너리로 전달
        response = supabase_client.auth.exchange_code_for_session({
            "auth_code": code
        })
        
        return {
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "user": {
                "id": response.user.id,
                "email": response.user.email,
                "user_metadata": response.user.user_metadata
            }
        }
    except Exception as e:
        print(f"OAuth 콜백 에러: {str(e)}")  # 디버깅용 로그 추가
        raise HTTPException(status_code=400, detail=str(e))

# 현재 사용자 정보
@app.get("/auth/me")
async def get_me(current_user = Depends(get_current_user)):
    """현재 로그인한 사용자 정보"""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "user_metadata": current_user.user_metadata,
        "created_at": current_user.created_at
    }

# 토큰 갱신
@app.post("/auth/refresh")
async def refresh_token(request: RefreshTokenRequest):
    """액세스 토큰 갱신"""
    try:
        response = supabase_client.auth.refresh_session(request.refresh_token)
        
        if not response.session:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid refresh token"
            )
        
        return {
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "expires_in": response.session.expires_in
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Token refresh failed: {str(e)}"
        )

# 로그아웃
@app.post("/auth/logout")
async def logout(current_user = Depends(get_current_user)):
    """로그아웃"""
    try:
        supabase_client.auth.sign_out()
        return {"message": "Successfully logged out"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)