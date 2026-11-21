import { getKakaoRestKey } from "@/lib/server-env";

type KakaoPlace = { place_name: string; address_name: string; x: string; y: string };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (!query || query.length > 100) {
    return Response.json({ error: "검색어는 1자 이상 100자 이하로 입력해 주세요." }, { status: 400 });
  }
  const key = getKakaoRestKey();
  if (!key) return Response.json({ error: "장소 검색 서비스가 설정되지 않았습니다." }, { status: 503 });

  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", query);
  url.searchParams.set("size", "5");
  try {
    const upstream = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) return Response.json({ error: upstream.status === 401 || upstream.status === 403 ? "카카오 장소 검색 API 인증키 또는 이용 권한을 확인해 주세요." : "장소 검색 서비스를 사용할 수 없습니다." }, { status: 502 });
    const body = await upstream.json() as { documents?: KakaoPlace[] };
    const places = (body.documents ?? []).map(({ place_name, address_name, x, y }) => ({ place_name, address_name, x, y }));
    return Response.json({ places }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "장소 검색 서비스에 연결하지 못했습니다." }, { status: 502 });
  }
}
