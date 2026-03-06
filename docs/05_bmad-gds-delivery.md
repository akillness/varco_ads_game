# BMAD-GDS Delivery Note

## Scope
- Pre-production/Design: VARCO Agent SAGA promo 콘셉트 유지
- Production 확장: 관전/배팅/에이전트 로그/SNS 공유
- Technical 확장: Docker Compose 기반 서버+웹 동시 실행 검증

## Implemented
1. Server APIs
- `GET /api/match/state`
- `POST /api/match/start`
- `POST /api/match/finish`
- `POST /api/match/bet`
- `GET /api/agent/logs`
- `POST /api/agent/log`
- `POST /api/share/sns`

2. Web UX (Molty-style 방향)
- 관전 지표 패널, 배당/베팅 풀 시각화
- 베팅 입력 폼 + 서버 연동
- 게임 이벤트 기반 에이전트 로그 축적
- X/Facebook/Telegram 공유 버튼

3. Docker verification
- `docker-compose.yml`로 `server + web(nginx)` 통합 실행
- nginx reverse proxy `/api -> server:8787`
- healthcheck 포함

## Runtime
- Web: `http://localhost:5173`
- Server: `http://localhost:8787`
