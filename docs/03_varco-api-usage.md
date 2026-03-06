# VARCO API 사용 문서

## 서버 환경 변수
- `VARCO_API_BASE`: 기본 `https://api.varco.ai`
- `VARCO_OPENAPI_KEY`: VARCO 발급 키
- `VARCO_TEXT2SOUND_PATH`: 기본 `/sound/varco/v1/api/text2sound`
- `VARCO_IMAGE_TO_3D_PATH`: 기본 `/3d/varco/v1/api/imagetothree`

## 내부 프록시 API

### 1) Health
`GET /api/health`

### 2) Text to Sound
`POST /api/varco/text2sound`

요청 예시:
```json
{
  "prompt": "전투 승리 함성",
  "version": "v1",
  "num_sample": 1
}
```

응답 예시:
```json
{
  "ok": true,
  "result": [
    { "audio": "..." }
  ]
}
```

### 3) Image to 3D
`POST /api/varco/image-to-3d`

요청 예시:
```json
{
  "image_url": "https://example.com/agent.png"
}
```

### 4) Generic Proxy
`POST /api/varco/proxy`

요청 예시:
```json
{
  "path": "/voice/varco/v1/api/tts",
  "body": {"text": "hello"}
}
```

## 실패/Mock 정책
- `VARCO_OPENAPI_KEY` 미설정 시 mock 응답으로 데모 가능
- 외부 API 오류 시 상태코드/에러 payload를 클라이언트에 전달
