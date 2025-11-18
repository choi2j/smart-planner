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
    
    # Gemini API 설정
    gemini_api_key: str
    
    # JWT 설정
    secret_key: str
    
    # Frontend 설정
    frontend_url: str
    
    class Config:
        env_file = ".env"
        case_sensitive = False  # 대소문자 구분 안함

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

# Supabase 클라이언트 초기화
supabase_client: Client = create_client(
    settings.supabase_url,
    settings.supabase_anon_key
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
    provider: str = "google"  # email, google, github 등


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AccountResponse(BaseModel):
    id: str
    user_id: str
    email: str
    provider: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    email: str


class TodoItem(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    location: Optional[str] = None
    priority: Optional[str] = "medium"  # low, medium, high
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


def get_user_by_email(email: str) -> Optional[dict]:
    """이메일로 계정 조회"""
    try:
        user_id = extract_user_id_from_email(email)
        # user_id로 Supabase에서 조회
        response = supabase_client.table("account").select("*").eq("user_id", user_id).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        print(f"Database error: {e}")
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    HTTP Bearer 토큰에서 현재 사용자 정보를 추출합니다.
    """
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
    
    # 데이터베이스에서 사용자 정보 조회
    account = get_user_by_email(email)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사용자를 찾을 수 없습니다."
        )
    
    return account

# ==================== Auth 엔드포인트 ====================

@app.post("/signup", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def signup(request: SignupRequest):
    """
    회원가입 엔드포인트
    
    요청:
    {
        "email": "dohan018018@gmail.com",
        "password": "securepassword123",
        "provider": "google"
    }
    """
    email = request.email.lower()
    
    # 이미 존재하는 계정 확인
    existing_account = get_user_by_email(email)
    if existing_account:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미 가입된 이메일입니다."
        )
    try:
        # user_id 추출 (이메일의 @ 앞부분)
        user_id = extract_user_id_from_email(email)
        
        # 비밀번호 해시
        hashed_password = hash_password(request.password)
        
        # 데이터베이스에 저장
        response = supabase_client.table("account").insert({
            "user_id": user_id,
            "email": email,
            "password": hashed_password,
            "provider": request.provider,
        }).execute()
        
        if response.data and len(response.data) > 0:
            account = response.data[0]
            return AccountResponse(
                id=account.get("id"),
                user_id=account.get("user_id"),
                email=account.get("email"),
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
    """
    로그인 엔드포인트
    
    요청:
    {
        "email": "dohan018018@gmail.com",
        "password": "securepassword123"
    }
    """
    email = request.email.lower()
    
    # 계정 조회
    account = get_user_by_email(email)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 틀렸습니다."
        )
    
    # 비밀번호 검증
    if not verify_password(request.password, account.get("password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 틀렸습니다."
        )
    
    # JWT 토큰 생성
    user_id = account.get("user_id")
    access_token = create_access_token(user_id, email)
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user_id,
        email=email
    )


@app.get("/me", response_model=AccountResponse)
async def get_current_user_info(current_user = Depends(get_current_user)):
    """
    현재 인증된 사용자 정보 조회
    Authorization: Bearer <token> 헤더 필요
    """
    return AccountResponse(
        id=current_user.get("id"),
        user_id=current_user.get("user_id"),
        email=current_user.get("email"),
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
            "due_date": "2025-11-18",
            "due_time": "10:00",
            "location": "회사",
            "priority": "high",
            "status": false
        }},
        {{
            "title": "장 보기",
            "description": "우유와 계란을 사야 함",
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
    AI를 사용하여 평문 메시지를 Todo 목록으로 변환
    """
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        prompt = TODO_EXTRACTION_PROMPT.format(
            message=request.message,
            today=today
        )
        response = model.generate_content(prompt)
        response_text = response.text.strip()

        # AI 응답에서 JSON 부분만 추출
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
        
        # JSON 마크다운 제거
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


@app.post('/send-todo')
async def send_todo_list(data: TodoItem, current_user = Depends(get_current_user)):
    """
    인증된 사용자의 Todo 저장
    Authorization: Bearer <token> 헤더 필요
    """
    try:
        response = supabase_client.table("todos").insert({
            "user_id": current_user.get("user_id"),
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


@app.post('/todos/save')
async def save_todos(request: SaveTodoRequest, current_user = Depends(get_current_user)):
    """
    여러 할 일 저장
    Authorization: Bearer <token> 헤더 필요
    """
    try:
        todos_data = []
        for todo in request.todos:
            todos_data.append({
                "user_id": current_user.get("user_id"),
                "title": todo.title,
                "description": todo.description,
                "due_date": todo.due_date,
                "due_time": todo.due_time,
                "location": todo.location,
                "priority": todo.priority,
                "status": todo.status
            })
        
        response = supabase_client.table("todos").insert(todos_data).execute()
        return {"success": True, "count": len(response.data)}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Todos 저장 중 오류 발생: {str(e)}"
        )


@app.get('/todos/load', response_model=List[TodoItem])
async def load_todos(current_user = Depends(get_current_user)):
    """
    사용자의 할 일 목록 로드
    Authorization: Bearer <token> 헤더 필요
    """
    try:
        response = supabase_client.table("todos").select("*").eq(
            "user_id", current_user.get("user_id")
        ).execute()
        
        todos = [TodoItem(**todo) for todo in response.data]
        return todos
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Todos 로드 중 오류 발생: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)