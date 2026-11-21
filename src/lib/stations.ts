import "server-only";

type SeoulRow = { stationId: string; stationName: string; stationLatitude: string; stationLongitude: string; parkingBikeTotCnt: string };
type SeoulResponse = { rentBikeStatus?: { list_total_count: number; RESULT?: { CODE: string }; row?: SeoulRow[] }; RESULT?: { CODE: string } };
export type Station = { id: string; name: string; lat: number; lng: number; count: number };
export class StationError extends Error {
  constructor(public readonly kind: "connection" | "upstream" | "response", message: string) { super(message); }
}
let cache: { data: Station[]; fetchedAt: number } | undefined;
let pending: Promise<{ data: Station[]; fetchedAt: number }> | undefined;

async function page(key: string, start: number, end: number) {
  // Seoul's documented endpoint on port 8088 uses HTTP; the key is sent in the URL.
  const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/bikeList/${start}/${end}/`;
  let response: Response;
  try { response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) }); }
  catch { throw new StationError("connection", "서울시 API에 연결하지 못했습니다. 서버 네트워크 설정을 확인해 주세요."); }
  if (!response.ok) throw new StationError("upstream", `서울시 API가 HTTP ${response.status} 응답을 반환했습니다.`);
  let body: SeoulResponse;
  try { body = await response.json() as SeoulResponse; } catch { throw new StationError("response", "서울시 API 응답 형식을 확인할 수 없습니다."); }
  const code = body.rentBikeStatus?.RESULT?.CODE ?? body.RESULT?.CODE;
  if (code === "INFO-200") return { list_total_count: 0, row: [] };
  if (code !== "INFO-000") throw new StationError("upstream", `서울시 API 결과 코드: ${code && /^[A-Z]+-\d+$/.test(code) ? code : "확인 불가"}`);
  if (!Array.isArray(body.rentBikeStatus?.row)) throw new StationError("response", "서울시 API 대여소 목록이 응답에 없습니다.");
  return body.rentBikeStatus;
}

export async function getStations() {
  const key = process.env.SEOUL_API_KEY?.trim();
  if (!key) throw new Error("missing key");
  if (cache && Date.now() - cache.fetchedAt < 60_000) return cache;
  if (pending) return pending;
  pending = (async () => {
    const rows: SeoulRow[] = [];
    // bikeList reports the returned page size as list_total_count, not the full total.
    for (let start = 1; start <= 10001; start += 1000) {
      const result = await page(key, start, start + 999);
      const batch = result.row ?? [];
      if (start > 10000 && batch.length) throw new StationError("response", "대여소 목록이 예상 크기를 초과했습니다.");
      rows.push(...batch);
      if (batch.length < 1000) break;
    }
    const data = rows.flatMap((row) => {
      const lat = Number(row.stationLatitude), lng = Number(row.stationLongitude), count = Number(row.parkingBikeTotCnt);
      if (!row.stationName || !String(row.stationLatitude ?? "").trim() || !String(row.stationLongitude ?? "").trim() || !String(row.parkingBikeTotCnt ?? "").trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132 || !Number.isInteger(count) || count < 0) return [];
      return [{ id: row.stationId || `${row.stationName}:${lat}:${lng}`, name: row.stationName, lat, lng, count }];
    });
    cache = { data, fetchedAt: Date.now() }; return cache;
  })();
  try { return await pending; } finally { pending = undefined; }
}

