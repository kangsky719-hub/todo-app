# 업무 진행 관리 웹앱 (todo-app)

## 프로젝트 개요
- 사용자(강지윤, 코딩 입문자)가 Claude Code로 만든 첫 웹앱. 회사 업무 관리용으로 실사용 중
- 할 일 목록 + 노션식 드래그 타임라인(간트차트), 상태(예정/진행중/완료) 관리, 프로젝트별 그룹핑
- 순수 HTML/CSS/JS (프레임워크 없음), `todo-app/` 폴더에 index.html / style.css / script.js 3개 파일

## 배포 & 저장소
- **실서비스 URL**: https://kangsky719-hub.github.io/todo-app/ (GitHub Pages)
- **GitHub**: https://github.com/kangsky719-hub/todo-app (main 브랜치, public)
- **배포 방식**: main에 push하면 GitHub Actions(`.github/workflows/deploy-pages.yml`)가 `todo-app/` 디렉토리를 Pages로 배포 (약 30초~1분)
- (구) Netlify https://whimsical-belekoy-13392c.netlify.app — 2026-07-22 무료 크레딧 소진으로 배포 정지되어 GitHub Pages로 이전. 옛 주소는 v=8 상태로 당분간 접속만 가능. `netlify.toml`은 기록용으로 남아 있음
- 로컬 실행: `python -m http.server 8080 --directory todo-app` (`.claude/launch.json`에 "todo-app" 설정 있음)

## 데이터 저장 구조
- **로컬**: localStorage (`todos` 키) — 항상 캐시로 유지, 비로그인 시 유일한 저장소
- **클라우드**: Supabase (프로젝트 ID: spbdgzttmkawxkhferxb, 리전 ap-southeast-1) — 연동 완료, 작동 확인됨
  - 이메일/비밀번호 로그인(사용자 계정: kangsky719@gmail.com) 시 `public.todos` 테이블과 동기화
  - RLS 정책 적용: 본인(user_id = auth.uid()) 데이터만 select/insert/update/delete 가능
  - anon(publishable) 키는 script.js에 하드코딩 — 공개용 키라 안전
  - 테이블 스키마: id(bigint PK), user_id(uuid, default auth.uid(), cascade delete), text, memo, project, start_date(date), end_date(date), status(text)
  - 로그인 시 클라우드가 비어 있고 로컬에 데이터가 있으면 업로드 여부를 confirm으로 물음
- 백업: 푸터의 내보내기/가져오기(JSON 파일)

## 주요 기능 (구현 완료)
1. **목록 뷰**: 추가(제목/프로젝트/시작일/종료일/상태/메모), 인라인 수정, 삭제, 상태 드롭다운, 필터(전체/예정/진행중/완료/지연), 시작일순 정렬, 프로젝트별 그룹 헤더, 지연 배지(빨강)
2. **간트차트 뷰 (노션식 타임라인)**:
   - 일자별 32px 칸 그리드(CELL_W=32), 월/일 헤더, 주말 음영, 오늘 빨간 원 표시
   - 상태별 색 막대: 회색=예정, 파랑=진행중, 검정(반투명)=완료, 지연=빨간 테두리
   - **드래그로 일정 이동** (막대 가운데), **양끝 핸들로 기간 조절** — pointer 이벤트, 터치 지원
   - 왼쪽 업무명 컬럼 sticky 고정, 날짜 영역만 가로 스크롤, 첫 진입 시 오늘 근처로 자동 스크롤
   - 드래그 완료 시 updateTodo → localStorage + (로그인 시) Supabase 동기화
3. **보드 뷰 (노션식 칸반)**: 예정/진행중/완료 3열, 카드 블럭을 드래그해서 다른 열에 놓으면 상태 변경 (pointer 이벤트, elementFromPoint로 드롭 대상 판정, 터치 지원). 카드/드롭존 크게 (min-height 320px)
4. **요약 대시보드**: 상단에 지연·오늘 마감·3일 내 마감·진행중 개수 칩, 클릭하면 목록 필터 적용(재클릭 시 해제)
5. **D-day 배지**: 미완료 업무에 D-7 이내 표시, 오늘 마감은 빨간 배지, 지연은 기존 지연 배지
6. **검색·정렬**: 통합 검색(제목/프로젝트/메모, 3개 뷰 모두 적용), 시작일순/마감일순/우선순위순 정렬 전환
7. **우선순위**: 높음/보통/낮음 — 입력·수정 폼, 목록/보드에 칩 표시(높음=검정 채움, 낮음=회색 테두리, 보통=표시 없음). DB에 priority 컬럼 없으면 자동으로 빼고 저장하며 sync-status에 경고 표시
8. **마감 알림**: 푸터 "알림 켜기" 버튼으로 브라우저 알림 권한 요청. 페이지 열려 있을 때 하루 1회(30분 주기 체크) 지연/오늘 마감/내일 마감 건수 알림. 페이지가 닫혀 있으면 알림 불가(서버 푸시 아님)
9. **자연어 빠른 추가**: 상단 입력줄에 "내일까지 보고서 #영업 !높음" 식으로 입력하면 날짜(오늘/내일/모레/X요일/다음주 X요일/M월 D일/M/D)·#프로젝트·!우선순위 자동 인식, 실시간 미리보기 후 Enter로 추가. 기존 상세 폼은 details로 접힘
10. **캘린더 뷰**: 월간 그리드(구글 캘린더식), 상태별 색 칩(최대 3개+더보기), 오늘 빨간 원, 주말 음영, ◀▶ 월 이동, 빈 날짜 클릭 시 해당 날짜로 상세 폼 프리필
11. **통계 뷰**: 전체/완료율/진행중/지연 타일, 상태 분포 스택바, 주간 완료 실적 막대그래프(최근 8주, completedAt 기준), 프로젝트별 진행률 바, 다가오는 7일 마감 목록, 지연 업무 목록(+경과일)
12. **반복 업무**: recurrence(없음/매일/매주/매월). 완료로 바꾸면 원본은 completedAt 기록+recurrence 없음으로 남고 다음 회차(날짜 이동)를 자동 생성. 목록/보드에 🔁 배지. 자연어 "매주/매일/매월"도 인식
13. **완료일 기록**: completedAt(status→완료 시 오늘 날짜, 되돌리면 삭제). 주간 그래프 집계에 사용. 이 기능 추가 이전 완료건은 completedAt이 없어 그래프에 안 잡힘
14. **PWA**: manifest.webmanifest + sw.js(오프라인 캐시, 네트워크 우선). 홈 화면 설치 가능. 아이콘 icon-192/512/maskable-512.png(PIL로 생성, Action Blue+체크). 알림은 앱이 열려 있을 때 확실히 작동하고, 닫힌 상태 알림은 periodicSync(설치된 PWA + Chrome/Edge 한정, best-effort)로 시도 — SW가 caches 'todo-meta'/__summary 읽어 알림. 완전 보장하는 닫힌앱 푸시는 백엔드(Supabase Edge Function + Web Push) 필요, 미구현. **sw.js 수정 시 CACHE 이름(todo-app-vN)과 CORE의 ?v=N도 함께 올릴 것**
15. **프로젝트 색상 카테고리**: 프로젝트마다 8색 팔레트(애플 시스템 색) 자동 배정, localStorage `projectColors`에 인덱스 저장(클라우드 아님, 표시 전용). 툴바 범례 칩 클릭 → 색상 피커 팝오버로 변경. 목록 그룹헤더 색점·항목 좌측 색띠, 보드 카드 좌측 색띠(지연이면 빨강 우선), 간트 바·캘린더 칩은 툴바 "색: 상태/프로젝트" 토글(localStorage `colorBy`)로 전환. 상태 색은 여전히 기본값
4. **인증 바**: 이메일/비밀번호 로그인·회원가입·로그아웃 (supabase-js v2 CDN), 동기화 상태/오류가 sync-status에 항상 표시됨
5. **캐시 버스팅**: index.html에서 `style.css?v=N`, `script.js?v=N` — **파일 수정 시 반드시 v 번호를 올려야 함** (현재 v=8). netlify.toml에 no-cache 헤더 설정됨

## 디자인 시스템
- Apple 디자인 시스템(VoltAgent/awesome-design-md의 Apple DESIGN.md)을 CSS 변수 토큰으로 적용
- 핵심 규칙: 단일 액센트 Action Blue(#0066cc), 본문 17px, 헤드라인 weight 600 + 음수 자간,
  카드에 그림자 금지(헤어라인 보더만), pill 라운딩(9999px)은 액션 요소 전용, 유틸리티는 8px
- 예외: 지연(마감 초과) 신호에만 시스템 레드(#ff3b30, --color-danger) 사용
- 폰트: SF Pro 스택 + Inter(Google Fonts) 폴백
- 라이트/다크 모드 자동 대응 (prefers-color-scheme)

## 데이터 모델 (JS)
```js
{ id, text, memo, project, startDate, endDate, status } // status: 예정|진행중|완료
```
- DB는 snake_case (start_date, end_date) — script.js의 fromRow/toRow에서 변환
- 날짜는 전부 "YYYY-MM-DD" 문자열, 헬퍼: todayStr(), addDays(), diffDays() (UTC 기준 연산)
- 지연 판정: status !== "완료" && endDate < todayStr()

## 작업 방식 (사용자 선호)
- 사용자는 코딩 완전 초보 — 설명은 쉽게, 전문용어는 풀어서, 한국어로 대화
- 수정 → git commit/push → Netlify 자동 배포 → 브라우저로 실배포 확인까지가 한 사이클
- 배포 확인은 `curl`로 새 코드 폴링 후 브라우저 접속으로 검증
- git 커밋 identity: 강지윤 / kangsky719@gmail.com (이 저장소에 로컬 설정됨)
- 계정 생성·로그인·결제 등은 사용자가 직접 수행 (Netlify/Supabase/GitHub 계정 모두 사용자 소유)

## 히스토리 요약 (2026-07-15 세션)
1. 기본 할 일 앱 생성 → GitHub(kangsky719-hub/todo-app) + Netlify 배포 파이프라인 구축
2. 상태(예정/진행중/완료) + 간트차트 기능 추가
3. Apple 디자인 시스템 토큰 적용 (전면 리스타일)
4. 업무용 기능 확장: 인라인 수정, 메모, 프로젝트 그룹, JSON 백업, 지연 표시, 오늘 기준선
5. Supabase 클라우드 동기화 + 이메일 인증 (사용자가 SQL Editor에서 테이블/RLS 생성 완료)
6. 간트차트를 노션식 드래그 타임라인으로 교체 (일자 칸 그리드, 드래그 이동/기간 조절)

## 다음에 할 만한 것 (미완료 아이디어)
- 간트 칸 크기/줌 조절, 막대에 업무명 표시
- 마감 임박 알림
- 담당자 필드 (팀 공유 시)
- 모바일 레이아웃 최적화

## 알려진 사항
- 스크린샷 도구: 브라우저 패널이 화면에 표시 중일 때만 작동 — 평소엔 DOM/JS 검증으로 대체
- Supabase 무료 플랜: 1주일 미사용 시 프로젝트 일시정지될 수 있음 (대시보드에서 재개 가능)
- 캐시 버전은 index.html에서 `?v=N`으로 관리 — 파일 수정 시 반드시 올릴 것 (현재 v=14). sw.js의 CACHE 이름·CORE 목록도 함께 갱신. GitHub Pages는 10분 캐시라 버전 갱신 필수
- **DB 선택 컬럼(priority, recurrence, completed_at)**: 사용자가 Supabase SQL Editor에서 아래 실행해야 클라우드에 저장됨. 미실행 시 앱이 자동으로 해당 컬럼만 빼고 저장(sync-status에 "~제외" 경고). script.js의 OPTIONAL_COLS/missingCols/detectMissingColumn이 처리. 실행 여부 미확인 시 사용자에게 확인할 것
  ```sql
  alter table public.todos add column if not exists priority text not null default '보통';
  alter table public.todos add column if not exists recurrence text not null default '없음';
  alter table public.todos add column if not exists completed_at date;
  ```
