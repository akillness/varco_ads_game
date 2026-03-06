# 레퍼런스 분석 (agent-browser 기반)

## 대상
1. `https://www.moltyroyale.com/`
2. `https://api.varco.ai/ko/reference/introduction?version=0`

## agent-browser 조사 결과

### Molty Royale
- 결과: `Under Maintenance – MoltyRoyale`
- 해석: 실서비스 화면 분석이 제한되어 "초경량 룰 + 관전/홍보 효과" 컨셉만 반영

실행 로그 요약:
```bash
agent-browser open https://www.moltyroyale.com --session varco_ref
agent-browser wait --load networkidle --session varco_ref
agent-browser snapshot -i --session varco_ref
# => Under Maintenance
```

### VARCO API 문서
- 확인 항목
  - `openapi_key` 헤더 필요
  - `Text to Sound` 엔드포인트 문서 확인
  - Body 필드: `version`, `prompt`, `num_sample`
  - 응답 예시: `[{ "audio": "string" }]`

실행 로그 요약:
```bash
agent-browser open https://api.varco.ai/ko/reference/introduction?version=0 --session varco_api
agent-browser snapshot -i --session varco_api
agent-browser get text body --session varco_api
```

## 설계 반영 포인트
- Molty 장점 반영: 룰 단순성, 짧은 진입 시간, 스트리밍 친화성
- VARCO 강점 반영: API 기반 실시간 생성형 콘텐츠(사운드/3D)
