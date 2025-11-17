import requests
import json

# API 엔드포인트
BASE_URL = "http://localhost:8000"

def test_case_1():
    """테스트 케이스 1: 복잡한 스케줄"""
    print("\n" + "="*60)
    print("테스트 케이스 #1: 복잡한 스케줄")
    print("="*60)
    
    url = f"{BASE_URL}/todo-request"
    data = {
        "message": "내일 오전 10시까지 회사에서 보고서 작성하고, 오후 3시에 팀 미팅 있어. 그리고 저녁에 장보러 가야 해"
    }
    
    print(f"📝 입력 메시지: {data['message']}")
    
    try:
        response = requests.post(url, json=data)
        response.raise_for_status()
        
        result = response.json()
        
        print(f"\n✅ 파싱 결과: 총 {len(result['todos'])}개의 할 일")
        print(f"\n원본 메시지: {result['original_message']}\n")
        
        for idx, todo in enumerate(result['todos'], 1):
            print(f"[{idx}] {todo['title']}")
            print(f"    📋 설명: {todo.get('description', 'N/A')}")
            print(f"    📅 날짜: {todo.get('due_date', 'N/A')}")
            print(f"    🕐 시간: {todo.get('due_time', 'N/A')}")
            print(f"    📍 장소: {todo.get('location', 'N/A')}")
            print(f"    ⚡ 우선순위: {todo.get('priority', 'N/A')}")
            print(f"    ✅ 완료: {'예' if todo.get('status', False) else '아니오'}")
            print()
        
        return result
        
    except requests.exceptions.RequestException as e:
        print(f"❌ 오류 발생: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"상세: {e.response.text}")
        return None


def test_case_2():
    """테스트 케이스 2: 간단한 할 일"""
    print("\n" + "="*60)
    print("테스트 케이스 #2: 간단한 할 일")
    print("="*60)
    
    url = f"{BASE_URL}/todo-request"
    data = {
        "message": "다음주 월요일까지 Python 프로젝트 완료하기"
    }
    
    print(f"📝 입력 메시지: {data['message']}")
    
    try:
        response = requests.post(url, json=data)
        response.raise_for_status()
        
        result = response.json()
        
        print(f"\n✅ 파싱 결과: 총 {len(result['todos'])}개의 할 일")
        print(f"\n원본 메시지: {result['original_message']}\n")
        
        for idx, todo in enumerate(result['todos'], 1):
            print(f"[{idx}] {todo['title']}")
            print(f"    📋 설명: {todo.get('description', 'N/A')}")
            print(f"    📅 날짜: {todo.get('due_date', 'N/A')}")
            print(f"    🕐 시간: {todo.get('due_time', 'N/A')}")
            print(f"    📍 장소: {todo.get('location', 'N/A')}")
            print(f"    ⚡ 우선순위: {todo.get('priority', 'N/A')}")
            print(f"    ✅ 완료: {'예' if todo.get('status', False) else '아니오'}")
            print()
        
        return result
        
    except requests.exceptions.RequestException as e:
        print(f"❌ 오류 발생: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"상세: {e.response.text}")
        return None


if __name__ == "__main__":
    print("🤖 SMART-PLANNER API 테스트 시작")
    
    # 테스트 1 실행
    result1 = test_case_1()
    
    # 테스트 2 실행
    result2 = test_case_2()
    
    print("\n" + "="*60)
    print("✨ 테스트 완료!")
    print("="*60)

