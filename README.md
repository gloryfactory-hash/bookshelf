# 작품 서가

작가별 작품 소개 사이트. 자세한 작업 규칙은 `CLAUDE.md`에 있습니다(Claude Code가 자동으로 읽습니다).

## 처음 한 번

1. [Node.js](https://nodejs.org) 20 이상 설치
2. 이 폴더에서 `npm install`
3. 화면 캡처를 쓰려면 `npx playwright install chromium`
4. Claude Code를 이 폴더에서 실행: `claude`

## 노션에 먼저 해 둘 것

이번 작업에서 정한 값(ID, 작가, 대상, 주제 키워드, 첫 출간년도)과 오타를 고친 소개가 아직 노션에는 없습니다. 노션을 원본으로 계속 쓰려면 한 번 옮겨 두세요.

1. 노션 "작품 목록" 데이터베이스에 속성 추가:
   - `ID`: 텍스트
   - `작가`: 다중 선택
   - `대상`: 선택 (저학년, 중학년, 고학년, 청소년, 일반)
   - `주제 키워드`: 다중 선택
   - `첫 출간년도`: 숫자
2. 데이터베이스 오른쪽 위 ··· 메뉴 → 가져오기 / CSV로 병합에서 `data/notion-merge.csv`를 고릅니다. 제목이 같은 행에 값이 채워집니다.
   - 메뉴 이름은 노션 버전에 따라 다를 수 있습니다.
   - 병합이 안 되면 `data/books.csv`를 보고 손으로 옮겨도 됩니다.

## 평소 작업

Claude Code에 이렇게 말하면 됩니다.

- "노션에서 새로 내보냈어. ~/Downloads/Export-... 폴더야. 반영해 줘"
- "『○○』 표지를 큰 걸로 바꿨어"
- "김민성 서가 시작하자"

직접 하려면 `npm run all`(정리 + 빌드) 후 `npm run dev`로 확인합니다.

## 배포

GitHub 저장소에 올리고 Settings → Pages → Source를 "GitHub Actions"로 바꾸면, main에 올릴 때마다 자동으로 배포됩니다.

- 주소: `https://<아이디>.github.io/<저장소>/limjihyung/`
- 개인 도메인도 연결할 수 있습니다.
