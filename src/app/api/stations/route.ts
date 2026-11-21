import { getStations, StationError } from "@/lib/stations";

export async function GET() {
  if (!process.env.SEOUL_API_KEY?.trim()) return Response.json({ error: "서울시 API 키가 설정되지 않았습니다." }, { status: 503 });
  try {
    const result = await getStations();
    return Response.json({ stations: result.data, fetchedAt: new Date(result.fetchedAt).toISOString(), source: "서울 열린데이터광장 bikeList" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof StationError ? error.message : "서울시 대여소 정보를 처리하지 못했습니다.", kind: error instanceof StationError ? error.kind : "processing" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

