# 내기골프 계산기

참석자 휴대폰 번호를 등록하면 참석자별 개인 링크를 문자로 보내, 각자 자기 휴대폰에서 본인 스코어를 입력하는 실시간 공유 기능이 포함되어 있습니다.

## 구조
- `public/index.html` — 화면(단일 파일)
- `netlify/functions/round.mjs` — 라운드 공유 API (`/api/round/*`)
- `netlify/lib/core.mjs` — 권한·저장 로직 (Netlify Blobs 저장)
- `scripts/dev-server.mjs` — 로컬 테스트 서버 (`npm install && npm run dev` → http://localhost:8888)

## 배포
서버 함수가 필요하므로 **Netlify Drop(파일 끌어다 놓기)으로는 동작하지 않습니다.**
Netlify 사이트를 이 GitHub 저장소에 연결하거나(Site configuration → Build & deploy → Link repository),
Netlify CLI로 배포하세요: `npx netlify-cli deploy --prod`
