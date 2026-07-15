# 업무 진행 관리 웹앱 (todo-app)

## 프로젝트 개요
- 사용자(강지윤, 코딩 입문자)가 회사 업무 관리용으로 만든 첫 웹앱
- 할 일 목록 + 간트차트 뷰, 상태(예정/진행중/완료) 관리, 프로젝트별 그룹핑
- 순수 HTML/CSS/JS (프레임워크 없음), `todo-app/` 폴더에 3개 파일

## 배포 & 저장소
- **실서비스 URL**: https://whimsical-belekoy-13392c.netlify.app
- **GitHub**: https://github.com/kangsky719-hub/todo-app (main 브랜치)
- **배포 방식**: main에 push하면 Netlify가 자동 재배포 (30초~1분). `netlify.toml`이 publish 디렉토리를 `todo-app`으로 지정
- 로컬 실행: `python -m http.server 8080 --directory todo-app` (`.claude/launch.json`에 "todo-app" 설정 있음)

## 데이터 저장 구조
- **로컬**: localStorage (`todos` 키) — 항상 캐시로 유지
- **클라우드**: Supabase (프로젝트 ID: spbdgzttmkawxkhferxb, 리전 ap-southeast-1)
  - 이메일/비밀번호 로그인 시 `public.todos` 테이블과 동기화, RLS로 본인(user_id) 데이터만 접근
  - anon(publishable) 키는 script.js에 하드코딩 — 공개용 키라 안전
  - 테이블 스키마: id(bigint PK), user_id(uuid, default auth.uid()), text, memo, project, start_date, end_date, status
- 백업: 푸터의 내보내기/가져오기(JSON)

## 디자인 시스템
- Apple 디자인 시스템(awesome-design-md의 DESIGN.md)을 토큰으로 적용
- 핵심 규칙: 단일 액센트 Action Blue(#0066cc), 본문 17px, 헤드라인 weight 600 + 음수 자간,
  카드에 그림자 금지(헤어라인 보더만), pill 라운딩은 액션 요소 전용
- 예외적으로 지연(마감 초과) 신호에만 시스템 레드(#ff3b30) 사용
- 라이트/다크 모드 자동 대응 (prefers-color-scheme)

## 데이터 모델 (JS)
```js
{ id, text, memo, project, startDate, endDate, status } // status: 예정|진행중|완료
```
DB는 snake_case (start_date, end_date) — script.js의 fromRow/toRow에서 변환

## 작업 방식 (사용자 선호)
- 사용자는 코딩 완전 초보 — 설명은 쉽게, 전문용어는 풀어서
- 수정 → git commit/push → Netlify 자동 배포 → 브라우저로 실배포 확인까지가 한 사이클
- git 커밋 identity: 강지윤 / kangsky719@gmail.com (로컬 설정됨)

## 다음에 할 만한 것 (미완료 아이디어)
- 간트차트 날짜 눈금 세분화
- 마감 임박 알림
- 담당자 필드 (팀 공유 시)
