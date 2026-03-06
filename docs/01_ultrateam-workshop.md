# ULTRATEAM 합의 회의록

참여 역할: QA, PM, Game Designer, Game System Engineer, Server Programmer, Web Programmer

## 라운드 1: 범위 합의
- PM: 1차 목표는 "브랜드 홍보용 즉시 플레이 가능한 프로토타입"으로 한정
- Game Designer: Molty 스타일처럼 규칙은 단순하게, 서사는 Agent 중심으로
- System Engineer: 게임 루프는 "수집/회피/로그" 3단 구성
- Server Programmer: 외부 API는 직접 호출 대신 프록시 서버로 키 보호
- Web Programmer: 모바일 대응 가능한 가벼운 2D 웹 UI 채택
- QA: 외부 API 키 부재 시에도 데모 가능하도록 mock 응답 제공

합의:
1. 프론트 단일 페이지 + 백엔드 프록시 2계층 구조
2. API 실패시 게임은 중단하지 않고 로깅/경고 처리
3. 빌드/실행 명령을 단순화 (`npm run install:all`, `npm run dev`, `npm run build`)

## 라운드 2: 기능 우선순위
- P0: Agent 선택, 이동/충돌/점수, API 호출 버튼, 결과 로그
- P1: 마켓플레이스/수익 모델 카드, 문서화
- P2: 실제 VARCO 3D 업로드/결제 연동(후속)

## 라운드 3: 품질 기준
- QA 체크 항목
  - 게임 시작/정지/리셋 정상 동작
  - HP 0 시 종료 처리
  - API 호출 성공/실패/mock 분기
  - 빌드 성공

최종 합의:
- 현재 버전은 홍보 데모 + 기술검증(PoC)로 승인
