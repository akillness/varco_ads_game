# VARCO Agent SAGA - GDD (요약)

## 코어 루프
1. Agent 선택 (3D Modeler / Sound Crafter / SyncFace Weaver)
2. 격자 월드에서 UGC Core 수집
3. 적 회피하며 생존
4. 로그를 홍보 스토리로 활용

## 시스템 특징
- Make-to-Play
  - 외형 기반 캐릭터를 즉시 플레이 단위로 변환
- Agent Marketplace
  - 플레이 로그/아이템/스킨 거래의 기초 구조
- API Subscription
  - 생성형 API 연동량 기반 BM

## UX 원칙
- 1분 내 규칙 이해
- 키보드 즉시 조작
- API 버튼 1회로 생성형 가치 체험

## 기술 구조
- Frontend: React + Vite
- Backend: Express 프록시
- 외부: VARCO API

## 확장 백로그
1. 실제 3D 에셋 업로드/미리보기
2. 관전 모드 + 채팅
3. 에이전트 로그의 SNS 공유
4. 랭킹/시즌제
