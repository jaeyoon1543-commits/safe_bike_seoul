import "server-only";
import { weatherGrid } from "@/lib/weather-grid";

type Item = { category: string; fcstDate: string; fcstTime: string; fcstValue: string; baseDate: string; baseTime: string };
type KmaResponse = { response?: { header?: { resultCode?: string }; body?: { items?: { item?: Item[] } } } };
const noStore = { "Cache-Control": "no-store" };
const releases = [2, 5, 8, 11, 14, 17, 20, 23];
const pad = (n: number) => String(n).padStart(2, "0");
const dateString = (date: Date) => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const rawLat = query.get("lat"), rawLng = query.get("lng");
  const lat = Number(rawLat), lng = Number(rawLng);
  if (!rawLat?.trim() || !rawLng?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) return Response.json({ error: "유효한 출발지 좌표가 필요합니다." }, { status: 400, headers: noStore });
  let key = process.env.DATA_GO_KR_API_KEY?.trim();
  if (!key) return Response.json({ error: "공공데이터포털 API 키가 설정되지 않았습니다." }, { status: 503, headers: noStore });
  try {
    if (/%[\da-f]{2}/i.test(key)) key = decodeURIComponent(key);
    const { nx, ny } = weatherGrid(lat, lng);
    const nowKst = new Date(Date.now() + 9 * 3600000);
    // Allow 15 minutes for publication; retry the previous release if not yet available.
    const candidates: { date: string; time: string; timestamp: number }[] = [];
    for (let day = 0; day <= 1; day++) {
      const d = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() - day));
      for (const hour of releases) {
        const stamp = d.getTime() + hour * 3600000;
        if (stamp <= nowKst.getTime() - 15 * 60000) candidates.push({ date: dateString(d), time: `${pad(hour)}00`, timestamp: stamp });
      }
    }
    candidates.sort((a, b) => b.timestamp - a.timestamp);
    for (const base of candidates.slice(0, 2)) {
      const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst");
      for (const [name, value] of Object.entries({ serviceKey: key, pageNo: "1", numOfRows: "1000", dataType: "JSON", base_date: base.date, base_time: base.time, nx: String(nx), ny: String(ny) })) url.searchParams.set(name, value);
      const upstream = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!upstream.ok) throw new Error("기상청 API 연결에 실패했습니다.");
      const body = await upstream.json() as KmaResponse;
      const code = body.response?.header?.resultCode;
      if (code === "03") continue;
      if (code !== "00") throw new Error("기상청 단기예보 API 이용 승인 또는 인증키를 확인해 주세요.");
      const items = body.response?.body?.items?.item ?? [];
      const now = `${dateString(nowKst)}${pad(nowKst.getUTCHours())}${pad(nowKst.getUTCMinutes())}`;
      const times = [...new Set(items.filter((item) => item.category === "TMP" || item.category === "POP").map((item) => item.fcstDate + item.fcstTime))].filter((time) => time >= now).sort();
      for (const time of times) {
        const temperature = items.find((item) => item.category === "TMP" && item.fcstDate + item.fcstTime === time);
        const precipitation = items.find((item) => item.category === "POP" && item.fcstDate + item.fcstTime === time);
        if (temperature && precipitation && Number.isFinite(Number(temperature.fcstValue)) && Number.isFinite(Number(precipitation.fcstValue))) return Response.json({ nx, ny, temperature: Number(temperature.fcstValue), precipitationProbability: Number(precipitation.fcstValue), baseDate: temperature.baseDate, baseTime: temperature.baseTime, forecastDate: temperature.fcstDate, forecastTime: temperature.fcstTime }, { headers: noStore });
      }
    }
    return Response.json({ error: "가까운 시간의 단기예보를 찾지 못했습니다." }, { status: 502, headers: noStore });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message.startsWith("기상청") ? error.message : "기상청 단기예보에 연결하지 못했습니다." }, { status: 502, headers: noStore });
  }
}
