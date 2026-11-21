# Safe Bike Seoul

서울 자전거 지도 서비스. 사고다발지역은 과거 통계이며 기상 정보는 예보입니다.

## 시작하기

Node.js와 npm을 설치하고 기존 `.env` 파일에 필요한 키를 설정합니다.

- `NEXT_PUBLIC_KAKAO_JS_KEY`: 카카오 지도 JavaScript 키. 지도 SDK에 필요하며 브라우저에 공개됩니다. 카카오 개발자 콘솔에 허용할 웹 도메인(로컬 개발용 `http://localhost:3000` 포함)을 등록하세요.
- `KAKAO_REST_API_KEY`: 서버에서 장소 검색에 사용하는 REST API 키.
- `SEOUL_API_KEY`: 서울 열린데이터광장 bikeList 서버용 키.
- `DATA_GO_KR_API_KEY`: 공공데이터포털 서버용 키. 자전거 사고다발지역과 기상청 단기예보 서비스의 이용 승인이 필요합니다.

서버용 키에는 `NEXT_PUBLIC_`을 붙이지 마세요. `.env`와 `.env.local` 등 환경 파일은 Git에서 제외됩니다. 이미 Git에 추적되었거나 유출된 키가 있다면 무시 규칙만으로 제거되지 않으므로 해당 키를 재발급하고 저장소 이력을 확인해야 합니다.

```bash
npm install
npm run dev
```

PowerShell의 스크립트 실행 정책이 npm을 차단하면 `npm.cmd install`, `npm.cmd run dev`를 사용하세요. 브라우저에서 http://localhost:3000 을 엽니다. 환경 변수 변경 후 개발 서버를 재시작하세요.

## API

- `GET /api/places?query=여의도`: 서버에서 카카오 REST 장소 검색을 호출합니다. 결과는 `places` 배열입니다. 서버 키가 없으면 503, 상위 API 오류는 502입니다.
- `GET /api/stations`: 서울시 bikeList 대여소를 반환합니다. 서버에서 최대 60초 동안 캐시합니다. 출발지 주변 목록은 2km 이내 직선거리순 최대 10곳입니다. 서울시 제공 주소는 HTTP이므로 서버에서 서울시로 인증키가 암호화되지 않은 채 전송됩니다. 신뢰할 수 있는 네트워크에서 실행하세요.
- `GET /api/weather?lat=37.5665&lng=126.978`: 출발지를 기상청 격자로 변환하고 가장 가까운 미래 예보시각의 기온과 강수확률을 반환합니다. 발표시각과 예보시각은 한국시간입니다.

외부 배포 시 공개 API 호출에 대한 인증과 요청 제한을 별도로 적용하세요.

## GitHub 업로드

이 폴더가 아직 Git 저장소가 아니라면 초기화한 뒤 GitHub에 만든 빈 저장소의 주소를 연결합니다. 저장소 URL은 본인의 주소로 바꾸세요.

```bash
git init
git add .
git status --short
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

커밋 전 `git status --short`에서 `.env`, `.env.local`과 같은 실제 환경 파일이 포함되지 않았는지 확인하세요. `.gitignore`의 `.env*` 규칙은 아직 추적되지 않은 파일에 적용됩니다. 기존에 추적되었거나 업로드된 비밀키는 무시 규칙만으로 제거되지 않습니다. 유출된 키는 재발급하고 Git 이력도 확인하세요. 키를 README, 이슈, 로그 또는 스크린샷에 넣지 마세요.

## Vercel 배포

1. Vercel에서 GitHub 저장소를 가져와 Next.js 프로젝트로 설정합니다. 루트 디렉터리는 저장소 최상위이며, 설치와 빌드는 기본 설정(`npm install`, `npm run build`)을 사용할 수 있습니다.
2. 프로젝트의 **Settings → Environment Variables**에 위 네 변수를 각각 입력합니다. 실제 키 값은 저장소에 넣지 말고 기존 `.env`에서 직접 복사하세요. Production에 적용하고, Preview 배포를 사용할 경우 Preview에도 따로 적용합니다. `NEXT_PUBLIC_KAKAO_JS_KEY`는 브라우저에 공개되는 지도 JavaScript 키입니다. 나머지 세 키는 서버 전용이며 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.
3. Node.js는 Vercel에서 지원하는 24.x를 선택하세요. 로컬과 Vercel의 Node 버전이 다를 수 있으므로 Vercel 빌드 로그도 확인합니다. 변수 설정이나 변경 후 새 배포가 필요합니다.
4. 배포된 도메인에서 지도, 장소 검색, 대여소, 경로, 사고정보, 날씨를 각각 확인합니다. 로컬 빌드 성공만으로 외부 API 접근이나 배포 환경 동작을 보장할 수 없습니다. Vercel 함수 인스턴스는 독립적이므로 대여소 캐시도 인스턴스별로 동작합니다.

카카오디벨로퍼스 앱의 **카카오맵 → 사용 설정**을 켜고, **앱 → 플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인**에 실제 서비스 도메인과 필요한 Preview 도메인을 등록하세요. 로컬 개발에는 `http://localhost:3000`을 등록합니다. 배포 URL이 정해진 뒤 해당 URL의 도메인을 추가해야 합니다. 카카오맵 REST API 사용 설정 및 쿼터도 확인하세요. 카카오맵의 JavaScript 키는 REST API 키와 다릅니다.

서울시 bikeList는 서버에서 `http://openapi.seoul.go.kr:8088/`로 호출하므로 인증키가 서울시까지 암호화되지 않은 채 전송됩니다. Vercel 배포 시에도 이 제약은 같습니다. 서버용 키는 클라이언트에 보내지 않지만 네트워크 경로상의 노출 위험은 남습니다. 배포 후 외부 API 접근과 실행 시간 제한도 확인하세요.

참고: [Vercel 환경 변수](https://vercel.com/docs/environment-variables), [Vercel Node.js 버전](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [카카오맵 사용 설정](https://developers.kakao.com/docs/ko/kakaomap/common), [JavaScript SDK 도메인 설정](https://developers.kakao.com/docs/ko/app-setting/app).


