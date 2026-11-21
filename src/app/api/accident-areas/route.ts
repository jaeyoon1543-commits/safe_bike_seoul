import "server-only";

// The provider lists 2025 as the most recent available accident year.
const YEAR = 2025;
type Row = { afos_fid: string | number; spot_nm: string; lo_crd: string | number; la_crd: string | number; occrrnc_cnt: string | number };
type ResponseBody = { resultCode?: string; totalCount?: string | number; items?: { item?: Row[] | Row } };

export async function GET() {
  let key = process.env.DATA_GO_KR_API_KEY?.trim();
  if (!key) return Response.json({ error: "공공데이터포털 API 키가 설정되지 않았습니다." }, { status: 503 });
  try {
    if (/%[\da-f]{2}/i.test(key)) key = decodeURIComponent(key);
    async function page(pageNo: number) {
      const url = new URL("https://apis.data.go.kr/B552061/frequentzoneBicycle/getRestFrequentzoneBicycle");
      for (const [name, value] of Object.entries({ ServiceKey: key!, searchYearCd: String(YEAR), siDo: "11", guGun: "", type: "json", numOfRows: "100", pageNo: String(pageNo) })) url.searchParams.set(name, value);
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error("upstream HTTP error");
      const body = await res.json() as ResponseBody;
      if (body.resultCode !== "00" && body.resultCode !== "03") throw new Error("upstream API error");
      return body;
    }
    const first = await page(1);
    const total = Number(first.totalCount ?? 0);
    if (!Number.isSafeInteger(total) || total < 0 || total > 10000) throw new Error("invalid total");
    const pages = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / 100) - 1) }, (_, index) => page(index + 2)));
    const rows = [first, ...pages].flatMap((body) => body.items?.item ? (Array.isArray(body.items.item) ? body.items.item : [body.items.item]) : []);
    if (rows.length < total) throw new Error("incomplete data");
    const areas = rows.map((row) => ({ id: String(row.afos_fid), name: row.spot_nm, lat: Number(row.la_crd), lng: Number(row.lo_crd), count: Number(row.occrrnc_cnt) })).filter((area) => area.name && Number.isFinite(area.lat) && area.lat >= 37 && area.lat <= 38 && Number.isFinite(area.lng) && area.lng >= 126 && area.lng <= 128 && Number.isFinite(area.count));
    return Response.json({ year: YEAR, areas, source: "한국도로교통공단", fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "사고다발지역 정보를 가져오지 못했습니다. API 이용 신청 및 서버 연결을 확인해 주세요." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
