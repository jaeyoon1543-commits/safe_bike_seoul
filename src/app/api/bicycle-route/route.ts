import { getKakaoRestKey } from "@/lib/server-env";

type KakaoRoute = { status?: string; route?: { properties?: { totalDistance?: number; totalTime?: number }; legs?: { steps?: { path?: { points?: number[][] } }[] }[] } };
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const names = ["start_x", "start_y", "end_x", "end_y"] as const;
  const coordinates = names.map((name) => {
    const value = params.get(name);
    return value === null || !value.trim() ? NaN : Number(value);
  });
  if (coordinates.some((value, index) => !Number.isFinite(value) || (index % 2 === 0 ? Math.abs(value) > 180 : Math.abs(value) > 90))) {
    return Response.json({ error: "출발지와 목적지 좌표를 확인해 주세요." }, { status: 400, headers });
  }
  const key = getKakaoRestKey();
  if (!key) return Response.json({ error: "카카오 REST API 키가 설정되지 않았습니다." }, { status: 503, headers });
  try {
    const routes = await Promise.all(["BIKE_ONLY", "SHORTEST"].map(async (mode) => {
      const url = new URL("https://dapi.kakao.com/v2/routing/bicycle");
      names.forEach((name, index) => url.searchParams.set(name, String(coordinates[index])));
      url.searchParams.set("route_mode", mode);
      const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "카카오 자전거 경로 API 인증 또는 이용 권한을 확인해 주세요." : "카카오 자전거 경로 서비스가 요청을 처리하지 못했습니다.");
      const body = await response.json() as KakaoRoute;
      if (body.status !== "OK" || !body.route?.properties) throw new Error("해당 출발지와 목적지 사이의 자전거 경로를 찾지 못했습니다.");
      const points = (body.route.legs ?? []).flatMap((leg) => (leg.steps ?? []).flatMap((step) => step.path?.points ?? []));
      if (points.length < 2 || points.some((point) => !Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) throw new Error("카카오 경로 좌표를 확인할 수 없습니다.");
      return { mode, distance: body.route.properties.totalDistance, duration: body.route.properties.totalTime, points };
    }));
    return Response.json({ routes, fetchedAt: new Date().toISOString() }, { headers });
  } catch (error) {
    const message = error instanceof Error && error.name !== "TimeoutError" && !/fetch failed/i.test(error.message) ? error.message : "카카오 자전거 경로 서비스에 연결하지 못했습니다.";
    return Response.json({ error: message }, { status: 502, headers });
  }
}
