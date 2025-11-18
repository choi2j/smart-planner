from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timedelta
import google.generativeai as genai
import json
import hashlib
import os
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pydantic_settings import BaseSettings
import httpx

load_dotenv()

# ==================== 설정 클래스 ====================
class Settings(BaseSettings):
    # Supabase 설정
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str  # ← 🔴 추가: Service Role Key
    
    # Gemini API 설정
    gemini_api_key: str
    
    # JWT 설정
    secret_key: str
    
    # Frontend 설정
    frontend_url: str
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()

# ==================== FastAPI 앱 설정 ====================
app = FastAPI(
    title="SMART-PLANNER-API",
    description="SMART-PLANNER-API 백엔드",
    version="1.0.0"
)

# 보안 설정
security = HTTPBearer()
SECRET_KEY = settings.secret_key
ALGORITHM = "HS256"

# Gemini 설정
genai.configure(api_key=settings.gemini_api_key)
model = genai.GenerativeModel("gemini-2.0-flash")

# ==================== 🔴 수정: Supabase 클라이언트 2개 생성 ====================
# 일반 작업용 (anon key - RLS 적용됨)
supabase_client: Client = create_client(
    settings.supabase_url,
    settings.supabase_anon_key
)

# 인증 작업용 (service role key - RLS 무시)
supabase_admin: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== Pydantic 모델 ====================

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    provider: str = "google"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AccountResponse(BaseModel):
    id: int
    user_id: str
    provider: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    email: str


class TodoItem(BaseModel):
    title: str
    description: Optional[str] = None
    event_date: Optional[str] = None
    event_time: Optional[str] = None
    location: Optional[str] = None
    priority: Optional[str] = "medium"
    status: bool = False


class TodoResponse(BaseModel):
    original_message: str
    todos: List[TodoItem]
    todo_count: int


class TodoRequest(BaseModel):
    message: str


class SaveTodoRequest(BaseModel):
    todos: List[TodoItem]

# ==================== 유틸리티 함수 ====================

def extract_user_id_from_email(email: str) -> str:
    """이메일에서 user_id 추출 (@ 앞부분)"""
    return email.split("@")[0]


def hash_password(password: str) -> str:
    """SHA-256으로 비밀번호 해시"""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """비밀번호 검증"""
    return hashlib.sha256(plain_password.encode()).hexdigest() == hashed_password


def create_access_token(user_id: str, email: str, expires_delta: Optional[timedelta] = None) -> str:
    """JWT 토큰 생성"""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=24)
    
    to_encode = {
        "user_id": user_id,
        "email": email,
        "exp": expire
    }
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_user_by_user_id(user_id: str) -> Optional[dict]:
    """user_id로 계정 조회"""
    try:
        # 🔴 수정: admin 클라이언트 사용
        response = supabase_admin.table("account").select("*").eq("user_id", user_id).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        print(f"Database error: {e}")
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """HTTP Bearer 토큰에서 현재 사용자 정보 추출"""
    token = credentials.credentials
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        email: str = payload.get("email")
        
        if user_id is None or email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 토큰입니다."
            )
            
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="토큰이 만료되었습니다."
        )
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 토큰입니다."
        )
    
    account = get_user_by_user_id(user_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )
    
    return account

# ==================== Auth 엔드포인트 ====================

@app.post("/signup", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def signup(request: SignupRequest):
    """회원가입"""
    email = request.email.lower()
    user_id = extract_user_id_from_email(email)
    
    existing_account = get_user_by_user_id(user_id)
    if existing_account:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 가입된 이메일입니다."
        )
    try:
        hashed_password = hash_password(request.password)
        
        # 🔴 수정: admin 클라이언트 사용 (RLS 무시)
        response = supabase_admin.table("account").insert({
            "user_id": user_id,
            "password": hashed_password,
            "provider": request.provider,
        }).execute()
        
        if response.data and len(response.data) > 0:
            account = response.data[0]
            return AccountResponse(
                id=account.get("id"),
                user_id=account.get("user_id"),
                provider=account.get("provider"),
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="계정 생성에 실패했습니다."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"Signup error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="회원가입 중 오류가 발생했습니다."
        )


@app.post("/signin", response_model=TokenResponse)
async def login(request: LoginRequest):
    """로그인"""
    email = request.email.lower()
    user_id = extract_user_id_from_email(email)
    
    account = get_user_by_user_id(user_id)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 틀렸습니다."
        )
    
    if not verify_password(request.password, account.get("password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 틀렸습니다."
        )
    
    access_token = create_access_token(user_id, email)
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user_id,
        email=email
    )


@app.get("/me", response_model=AccountResponse)
async def get_current_user_info(current_user = Depends(get_current_user)):
    """현재 사용자 정보 조회"""
    return AccountResponse(
        id=current_user.get("id"),
        user_id=current_user.get("user_id"),
        provider=current_user.get("provider"),
    )

# ==================== 기본 엔드포인트 ====================

@app.get("/")
async def root():
    """헬스 체크"""
    return {
        "status": "running",
        "message": "AI Todo List API",
        "version": "1.0.0"
    }


class TestModel(BaseModel):
    testmsg: str


class TestResponse(BaseModel):
    retmsg: str


@app.post("/test", response_model=TestResponse)
async def test_endpoint(request: TestModel):
    """테스트 엔드포인트"""
    return TestResponse(retmsg=request.testmsg)

# ==================== AI Todo 엔드포인트 ====================

TODO_EXTRACTION_PROMPT = """당신은 사용자의 평문 메시지를 분석하여 할 일(Todo) 목록으로 변환하는 AI 어시스턴트입니다.

사용자 메시지: "{message}"

위 메시지를 분석하여 할 일 목록을 추출하세요. 다음 JSON 형식으로만 응답하세요:

{{
    "todos": [
        {{
        "title": "할 일 제목 (간결하게)",
        "description": "할 일에 대한 상세 설명",
        "event_date": "마감일 (YYYY-MM-DD 형식, 언급된 경우만, 없을경우 null)",
        "event_time": "마감날의 정확한 시간(HH:MM 형식, 언급된 경우만, 없을경우 null)",
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
5. 반드시 유효한 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.
6. 특정한 위치나 행동의 주체가 실행되어야하는 곳이 문장에 포함되어있을경우 location에 저장하세요

예시:
사용자: "내일까지 10시까지 회사보고서 작성하고, 장 봐야 해. 우유랑 계란 사야 함"
응답:
{{
    "todos": [
        {{
            "title": "보고서 작성",
            "description": "내일까지 완료해야 하는 보고서",
            "event_date": "2025-11-18",
            "event_time": "10:00",
            "location": "회사",
            "priority": "high",
            "status": false
        }},
        {{
            "title": "장 보기",
            "description": "우유와 계란을 사야 함",
            "event_date": null,
            "event_time": null,
            "location": null,
            "priority": "medium",
            "status": false
        }}
    ]
}}"""


@app.post("/todo-request", response_model=TodoResponse)
async def parse_todo(request: TodoRequest):
    """AI를 사용하여 평문 메시지를 Todo 목록으로 변환"""
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        prompt = TODO_EXTRACTION_PROMPT.format(
            message=request.message,
            today=today
        )
        response = model.generate_content(prompt)
        response_text = response.text.strip()

        try:
            start_index = response_text.find('{')
            end_index = response_text.rfind('}') + 1
            
            if start_index != -1 and end_index != -1:
                json_string = response_text[start_index:end_index]
            else:
                raise ValueError("AI 응답에서 유효한 JSON 객체를 찾을 수 없습니다.")
                
        except Exception as e:
            print(f"JSON 서브셋 추출 실패: {e}\n원본 응답: {response_text}")
            raise json.JSONDecodeError("Failed to extract JSON subset", response_text, 0)
        
        if json_string.startswith("```json"):
            json_string = json_string[7:]
        if json_string.startswith("```"):
            json_string = json_string[3:]
        if json_string.endswith("```"):
            json_string = json_string[:-3]
        
        json_string = json_string.strip()
        
        parsed_data = json.loads(json_string)
        todos = [TodoItem(**todo) for todo in parsed_data.get("todos", [])]
        
        return TodoResponse(
            original_message=request.message,
            todos=todos,
            todo_count=len(todos) 
        )
        
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=501,
            detail=f"AI 응답을 파싱하는 중 오류가 발생했습니다: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Todo 파싱 중 오류 발생: {str(e)}"
        )


@app.post('/send-task')
async def send_task(data: TodoItem, current_user = Depends(get_current_user)):
    """인증된 사용자의 Task 저장"""
    try:
        response = supabase_client.table("tasks").insert({
            "user_id": current_user.get("user_id"),
            "title": data.title,
            "description": data.description,
            "event_date": data.event_date,
            "event_time": data.event_time,
            "location": data.location,
            "priority": data.priority,
            "status": data.status
        }).execute()
        
        return {"success": True, "data": response.data}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Task 저장 중 오류 발생: {str(e)}"
        )


@app.post('/tasks/save')
async def save_tasks(request: SaveTodoRequest, current_user = Depends(get_current_user)):
    """여러 Task 저장"""
    try:
        tasks_data = []
        for task in request.todos:
            tasks_data.append({
                "user_id": current_user.get("user_id"),
                "title": task.title,
                "description": task.description,
                "event_date": task.event_date,
                "event_time": task.event_time,
                "location": task.location,
                "priority": task.priority,
                "status": task.status
            })
        
        response = supabase_client.table("tasks").insert(tasks_data).execute()
        return {"success": True, "count": len(response.data)}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Tasks 저장 중 오류 발생: {str(e)}"
        )


@app.get('/tasks/load', response_model=List[TodoItem])
async def load_tasks(current_user = Depends(get_current_user)):
    """사용자의 Task 목록 로드"""
    try:
        response = supabase_client.table("tasks").select("*").eq(
            "user_id", current_user.get("user_id")
        ).execute()
        
        tasks = [TodoItem(**task) for task in response.data]
        return tasks
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Tasks 로드 중 오류 발생: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
