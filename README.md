# VARCO Agent SAGA Promo Web Game

VARCO3D UGC 생태계 제안 기반의 홍보용 웹 게임 프로젝트입니다.

## Repository
- GitHub: `https://github.com/akillness/varco_ads_game`

```bash
git clone https://github.com/akillness/varco_ads_game.git
cd varco_ads_game
```

## Project Structure
- `web/`: Vite + React 프론트엔드 (홍보 페이지 + 플레이 가능한 게임)
- `server/`: Express API 서버/프록시 (VARCO API 연동 + 게임 보조 API)
- `docs/`: 기획/레퍼런스/API 문서
- `e2e/`: Playwright E2E 테스트

## Local Development
```bash
npm run install:all
npm run dev
```

- Web: `http://localhost:5173`
- Server health: `http://localhost:8787/api/health`

## Build
```bash
npm run build
```

## Docker Deployment
`.env` 파일 없이도 실행 가능하며, 실제 VARCO API 호출 시 `VARCO_OPENAPI_KEY`를 설정하세요.

```bash
export VARCO_OPENAPI_KEY="YOUR_KEY"
npm run docker:up
```

- Web (nginx): `http://localhost:5173`
- Server: `http://localhost:8787`
- Stop: `npm run docker:down`

## API Smoke Test
```bash
curl http://localhost:8787/api/health
curl http://localhost:8787/api/match/state
curl -X POST http://localhost:8787/api/match/bet \
  -H 'content-type: application/json' \
  -d '{"userName":"demo","side":"player","amount":100}'
```

## Environment Variables
`server/.env.example` 기준:
- `PORT`
- `VARCO_API_BASE`
- `VARCO_OPENAPI_KEY`
- `VARCO_TEXT2SOUND_PATH`
- `VARCO_IMAGE_TO_3D_PATH`
