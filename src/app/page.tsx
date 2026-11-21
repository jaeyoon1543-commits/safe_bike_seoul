"use client";

import { useEffect, useRef, useState } from "react";

type Place = { place_name: string; address_name: string; x: string; y: string };
type LatLng = object;
type MapInstance = { setCenter: (p: LatLng) => void; setLevel: (n: number) => void; getLevel: () => number };
type Overlay = { setMap: (map: MapInstance | null) => void };
type KakaoMaps = {
  load: (fn: () => void) => void;
  LatLng: new (lat: number, lng: number) => LatLng;
  Map: new (el: HTMLElement, options: object) => MapInstance;
  CustomOverlay: new (options: object) => Overlay;
  Polyline: new (options: object) => Overlay;
  services: { Places: new () => { keywordSearch: (query: string, callback: (results: Place[], status: string) => void) => void }; Status: { OK: string } };
};
declare global { interface Window { kakao?: { maps: KakaoMaps } } }

type Station = { id: string; name: string; lat: number; lng: number; count: number };
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = Math.PI / 180;
  const dLat = (lat2 - lat1) * radians, dLng = (lng2 - lng1) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
type BicycleRoute = { mode: "BIKE_ONLY" | "SHORTEST"; distance: number; duration: number; points: [number, number][] };
type Weather = { temperature: number; precipitationProbability: number; baseDate: string; baseTime: string; forecastDate: string; forecastTime: string; nx: number; ny: number };
function weatherTime(date: string, time: string) { return `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)} ${time.slice(0, 2)}:${time.slice(2, 4)}`; }
function fetchedTime(value: string) { return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
type AccidentArea = { id: string; name: string; lat: number; lng: number; count: number };
function distanceToRoute(area: AccidentArea, route: BicycleRoute) {
  const scale = Math.PI / 180 * 6371000;
  const xScale = scale * Math.cos(area.lat * Math.PI / 180);
  let nearest = Infinity;
  for (let i = 1; i < route.points.length; i++) {
    const [x1, y1] = route.points[i - 1], [x2, y2] = route.points[i];
    const ax = (x1 - area.lng) * xScale, ay = (y1 - area.lat) * scale;
    const bx = (x2 - area.lng) * xScale, by = (y2 - area.lat) * scale;
    const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
    nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return nearest;
}
const icons: Record<string, string> = { search: "⌕", bike: "♧", route: "⌁", alert: "△", weather: "☀", pin: "◇" };
function Icon({ name }: { name: string }) { return <span className={`icon icon-${name}`} aria-hidden="true">{icons[name]}</span>; }

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const overlays = useRef<Overlay[]>([]);
  const [mapStatus, setMapStatus] = useState(process.env.NEXT_PUBLIC_KAKAO_JS_KEY ? "지도를 불러오는 중입니다." : "카카오맵 키를 설정하면 지도가 표시됩니다.");
  const [ready, setReady] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [activeField, setActiveField] = useState<"origin" | "destination">("origin");
  const [results, setResults] = useState<Place[]>([]);
  const [message, setMessage] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [stationStatus, setStationStatus] = useState("대여소 정보를 불러오는 중입니다.");
  const [stationUpdated, setStationUpdated] = useState("");
  const [originPoint, setOriginPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherStatus, setWeatherStatus] = useState("");
  const [destinationPoint, setDestinationPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [routes, setRoutes] = useState<BicycleRoute[]>([]);
  const [routeStatus, setRouteStatus] = useState("대여소와 목적지를 선택해 주세요.");
  const [routeUpdated, setRouteUpdated] = useState("");
  const [accidents, setAccidents] = useState<AccidentArea[]>([]);
  const [accidentYear, setAccidentYear] = useState<number | null>(null);
  const [accidentUpdated, setAccidentUpdated] = useState("");
  const [accidentStatus, setAccidentStatus] = useState("사고다발지역 정보를 불러오는 중입니다.");
  const nearAccidents = accidents.map((area) => ({ ...area, matches: routes.map((route) => ({ mode: route.mode, distance: distanceToRoute(area, route) })).filter((match) => match.distance <= 200) })).filter((area) => area.matches.length > 0).sort((a, b) => Math.min(...a.matches.map((m) => m.distance)) - Math.min(...b.matches.map((m) => m.distance)));
  const routeRequest = useRef(0);
  const nearby = originPoint ? stations.map((station) => ({ ...station, distance: distanceMeters(originPoint.lat, originPoint.lng, station.lat, station.lng) })).filter((station) => station.distance <= 2000).sort((a, b) => a.distance - b.distance).slice(0, 10) : [];
  const [layers, setLayers] = useState({ stations: true, route: true, accidents: true });

  useEffect(() => {
    if (!originPoint) return;
    const controller = new AbortController();
    async function loadWeather() {
      try {
        const params = new URLSearchParams({ lat: String(originPoint!.lat), lng: String(originPoint!.lng) });
        const response = await fetch(`/api/weather?${params}`, { signal: controller.signal });
        const data: Weather & { error?: string } = await response.json();
        if (!response.ok) throw new Error(data.error ?? "단기예보를 불러오지 못했습니다.");
        if (!controller.signal.aborted) { setWeather(data); setWeatherStatus(""); }
      } catch (error) {
        if (!controller.signal.aborted) { setWeather(null); setWeatherStatus(error instanceof Error ? error.message : "단기예보를 불러오지 못했습니다."); }
      }
    }
    loadWeather();
    return () => controller.abort();
  }, [originPoint]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadAccidents() {
      try {
        const response = await fetch("/api/accident-areas", { signal: controller.signal });
        const data: { areas?: AccidentArea[]; year?: number; fetchedAt?: string; error?: string } = await response.json();
        if (!response.ok || !data.areas || !data.year) throw new Error(data.error || "사고다발지역 정보를 불러오지 못했습니다.");
        setAccidents(data.areas); setAccidentYear(data.year); setAccidentUpdated(data.fetchedAt ?? ""); setAccidentStatus("");
      } catch (error) { if (!controller.signal.aborted) setAccidentStatus(error instanceof Error ? error.message : "사고다발지역 정보를 불러오지 못했습니다."); }
    }
    loadAccidents();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadStations() {
      try {
        const response = await fetch("/api/stations", { signal: controller.signal });
        const data: { stations?: Station[]; fetchedAt?: string; error?: string } = await response.json();
        if (!response.ok) throw new Error(data.error || "대여소 정보를 불러오지 못했습니다.");
        setStations(data.stations ?? []); setStationUpdated(data.fetchedAt ?? "");
        setStationStatus(data.stations?.length ? "" : "표시할 대여소가 없습니다.");
      } catch (error) {
        if (!controller.signal.aborted) { setStations([]); setStationUpdated(""); setStationStatus(error instanceof Error ? error.message : "대여소 정보를 불러오지 못했습니다."); }
      }
    }
    loadStations();
    const interval = window.setInterval(loadStations, 60000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!key) return;
    let cancelled = false;
    const initialize = () => {
      if (!window.kakao?.maps) { setMapStatus("지도를 불러오지 못했습니다. 카카오맵 설정을 확인해 주세요."); return; }
      window.kakao.maps.load(() => {
        if (cancelled || !mapRef.current || !window.kakao) return;
        const maps = window.kakao.maps;
        map.current = new maps.Map(mapRef.current, { center: new maps.LatLng(37.5295, 126.931), level: 5 });
        setReady(true); setMapStatus("");
      });
    };
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=services`;
    script.async = true; script.onload = initialize;
    script.onerror = () => setMapStatus("지도를 불러오지 못했습니다. 카카오맵 키와 등록 도메인을 확인해 주세요.");
    document.head.appendChild(script);
    return () => { cancelled = true; script.remove(); };
  }, []);

  useEffect(() => {
    if (!ready || !map.current || !window.kakao) return;
    const maps = window.kakao.maps; const currentMap = map.current;
    overlays.current.forEach((item) => item.setMap(null)); overlays.current = [];
    const add = (lat: number, lng: number, content: string) => overlays.current.push(new maps.CustomOverlay({ map: currentMap, position: new maps.LatLng(lat, lng), content, yAnchor: 1 }));
    if (layers.stations) stations.forEach((s) => add(s.lat, s.lng, `<div class="map-marker station-marker">♧ <b>${s.count}</b></div>`));
    if (layers.accidents) accidents.forEach((area) => add(area.lat, area.lng, `<div class="map-marker accident-marker${routes.some((route) => distanceToRoute(area, route) <= 200) ? " accident-near" : ""}">!</div>`));
    if (layers.route) routes.forEach((route) => {
      overlays.current.push(new maps.Polyline({ map: currentMap, path: route.points.map(([lng, lat]) => new maps.LatLng(lat, lng)), strokeWeight: route.mode === "BIKE_ONLY" ? 6 : 4, strokeColor: route.mode === "BIKE_ONLY" ? "#14a77d" : "#427bd2", strokeOpacity: 0.85, strokeStyle: route.mode === "BIKE_ONLY" ? "solid" : "shortdash" }));
    });
    return () => { overlays.current.forEach((item) => item.setMap(null)); overlays.current = []; };
  }, [ready, layers, stations, routes, accidents]);

  async function search(field: "origin" | "destination") {
    const query = (field === "origin" ? origin : destination).trim(); setActiveField(field); setResults([]);
    if (!query) { setMessage("검색할 장소를 입력해 주세요."); return; }
    setMessage("장소를 검색하고 있습니다.");
    try {
      const response = await fetch(`/api/places?query=${encodeURIComponent(query)}`);
      const data: { places?: Place[]; error?: string } = await response.json();
      if (!response.ok) { setMessage(data.error ?? "장소 검색을 사용할 수 없습니다."); return; }
      if (data.places?.length) { setResults(data.places); setMessage(""); }
      else setMessage("검색 결과가 없습니다. 다른 검색어를 입력해 주세요.");
    } catch { setMessage("장소 검색 서비스에 연결하지 못했습니다."); }
  }
  function selectPlace(place: Place) {
    if (activeField === "origin") { setWeather(null); setWeatherStatus("기상청 단기예보를 불러오는 중입니다."); setOrigin(place.place_name); setOriginPoint({ lat: Number(place.y), lng: Number(place.x) }); setSelectedStation(null); } else { setDestination(place.place_name); setDestinationPoint({ lat: Number(place.y), lng: Number(place.x) }); }
    routeRequest.current++; setRoutes([]); setRouteStatus("대여소와 목적지를 선택한 후 경로를 조회해 주세요.");
    if (window.kakao && map.current) { map.current.setCenter(new window.kakao.maps.LatLng(Number(place.y), Number(place.x))); map.current.setLevel(4); }
    setResults([]); setMessage("선택한 장소로 지도를 이동했습니다.");
  }
  async function findRoutes() {
    const requestId = ++routeRequest.current;
    setRoutes([]);
    if (!selectedStation || !destinationPoint) { setRouteStatus("따릉이 대여소와 목적지 검색 결과를 선택해 주세요."); return; }
    setRouteStatus("카카오 자전거 경로를 조회하고 있습니다.");
    const params = new URLSearchParams({ start_x: String(selectedStation.lng), start_y: String(selectedStation.lat), end_x: String(destinationPoint.lng), end_y: String(destinationPoint.lat) });
    try {
      const response = await fetch(`/api/bicycle-route?${params}`);
      const data: { routes?: BicycleRoute[]; fetchedAt?: string; error?: string } = await response.json();
      if (requestId !== routeRequest.current) return;
      if (!response.ok || !data.routes) { setRouteStatus(data.error ?? "자전거 경로를 불러오지 못했습니다."); return; }
      setRoutes(data.routes); setRouteUpdated(data.fetchedAt ?? ""); setRouteStatus(""); setLayers((previous) => ({ ...previous, route: true }));
    } catch { if (requestId === routeRequest.current) setRouteStatus("자전거 경로 서비스에 연결하지 못했습니다."); }
  }
  function toggle(key: keyof typeof layers) { setLayers((previous) => ({ ...previous, [key]: !previous[key] })); }
  function zoom(delta: number) { if (map.current) map.current.setLevel(Math.max(1, Math.min(14, map.current.getLevel() + delta))); }

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">↗</span><span>SAFE BIKE <strong>SEOUL</strong></span></div><div className="top-right"><span className="top-dot" /> 서울 자전거 이동 정보 <span className="top-divider" /><span className="demo-tag">BETA</span></div></header>
    <div className="workspace"><aside className="sidebar">
      <div className="intro"><div className="eyebrow"><span /> YOUR SAFER RIDE</div><h1>오늘도 안전하게,<br /><em>서울을 달려요.</em></h1><p>목적지까지의 여정을 미리 살펴보세요.</p></div>
      <section className="search-card"><div className="section-heading"><div><span className="section-kicker">PLAN YOUR RIDE</span><h2>어디로 떠나시나요?</h2></div><span className="heading-icon">↗</span></div>
        <div className="input-stack"><div className="input-line"><span className="point start-point" /><input aria-label="출발지 검색" placeholder="출발지를 검색해 주세요" value={origin} onChange={(e) => { setOrigin(e.target.value); setOriginPoint(null); setSelectedStation(null); routeRequest.current++; setRoutes([]); setRouteStatus("출발지 주변 대여소를 선택해 주세요."); }} onKeyDown={(e) => { if (e.key === "Enter") search("origin"); }} /><button aria-label="출발지 검색" onClick={() => search("origin")}><Icon name="search" /></button></div><div className="input-line"><span className="point end-point" /><input aria-label="목적지 검색" placeholder="목적지를 검색해 주세요" value={destination} onChange={(e) => { setDestination(e.target.value); setDestinationPoint(null); routeRequest.current++; setRoutes([]); setRouteStatus("목적지 검색 결과를 선택해 주세요."); }} onKeyDown={(e) => { if (e.key === "Enter") search("destination"); }} /><button aria-label="목적지 검색" onClick={() => search("destination")}><Icon name="search" /></button></div></div>
        <button className="search-button" onClick={() => search(!origin ? "origin" : "destination")}>장소 검색하기 <span>↗</span></button>
        {message && <p className="search-message" role="status">{message}</p>}{results.length > 0 && <div className="results" aria-label="장소 검색 결과">{results.map((p, i) => <button key={`${p.x}-${p.y}-${i}`} onClick={() => selectPlace(p)}><strong>{p.place_name}</strong><small>{p.address_name}</small></button>)}</div>}
      </section>
      <div className="sidebar-section"><div className="section-title"><div><span className="section-kicker">ON THE MAP</span><h2>지도에서 살펴보기</h2></div><span className="sample-label">과거 사고정보</span></div><p className="section-description">사고다발지역은 과거 통계이며 실시간 정보가 아닙니다.</p>
        <div className="layer-list"><button className="layer-row" onClick={() => toggle("stations")} aria-pressed={layers.stations}><span className="layer-icon mint"><Icon name="bike" /></span><span><strong>따릉이 대여소</strong><small>주변 대여소와 자전거 수</small></span><span className={`switch ${layers.stations ? "on" : ""}`} /></button><button className="layer-row" onClick={() => toggle("route")} aria-pressed={layers.route}><span className="layer-icon blue"><Icon name="route" /></span><span><strong>자전거 경로</strong><small>카카오 경로 표시</small></span><span className={`switch ${layers.route ? "on" : ""}`} /></button><button className="layer-row" onClick={() => toggle("accidents")} aria-pressed={layers.accidents}><span className="layer-icon coral"><Icon name="alert" /></span><span><strong>사고 정보</strong><small>주변 사고 주의 구간</small></span><span className={`switch ${layers.accidents ? "on" : ""}`} /></button></div>
        <div className="nearby-stations"><div className="section-title"><h2>출발지 주변 대여소</h2><span className="sample-label">직선거리 2km</span></div>
          {stationStatus ? <p className="station-status" role="status">{stationStatus}</p> : !originPoint ? <p className="station-status">출발지를 검색하고 결과를 선택해 주세요.</p> : nearby.length === 0 ? <p className="station-status">2km 이내 대여소가 없습니다.</p> : <div className="nearby-list">{nearby.map((station) => <button key={station.id} aria-pressed={selectedStation?.id === station.id} onClick={() => { setSelectedStation(station); routeRequest.current++; setRoutes([]); setRouteStatus("선택한 대여소에서 목적지까지 경로를 조회해 주세요."); if (map.current && window.kakao) { map.current.setCenter(new window.kakao.maps.LatLng(station.lat, station.lng)); map.current.setLevel(3); } }}><span><strong>{station.name}{selectedStation?.id === station.id ? " ✓" : ""}</strong><small>{station.distance < 1000 ? Math.round(station.distance) + "m" : (station.distance / 1000).toFixed(1) + "km"} · 직선거리</small></span><b>{station.count}대</b></button>)}</div>}
          {stationUpdated && <p className="station-updated">서버 조회: {fetchedTime(stationUpdated)} (한국시간) · 출처: 서울 열린데이터광장. 원본 측정시각은 제공되지 않습니다.</p>}
          <button className="search-button" onClick={findRoutes}>자전거 경로 조회하기 <span>↗</span></button>
          <p className="station-status" role="status">{routeStatus}</p>
        </div>
      </div><div className="sidebar-footer"><span>✳</span><p><strong>안전한 라이딩을 위한 첫걸음</strong><br />헬멧 착용과 교통 규칙을 잊지 마세요.</p></div>
    </aside><section className="map-area" aria-label="서울 자전거 지도"><div ref={mapRef} className="map-canvas" />{mapStatus && <div className="map-fallback"><div className="fallback-grid" /><div className="fallback-content"><span>⌁</span><strong>{mapStatus}</strong><small>카카오 개발자 설정과 네트워크 연결을 확인해 주세요.</small></div></div>}
      <div className="map-top"><div className="location-pill"><span>⌖</span><div><small>지금 보고 있는 곳</small><strong>서울 · 여의도 일대</strong></div><span className="chevron">⌄</span></div><div className="map-notice"><span>✳</span> 사고다발지역은 <strong>{accidentYear ? `${accidentYear}년 과거 정보` : "과거 정보"}</strong></div></div>
      <div className="map-controls"><button onClick={() => zoom(-1)} aria-label="지도 확대">+</button><button onClick={() => zoom(1)} aria-label="지도 축소">−</button><button className="locate" onClick={() => { if (map.current && window.kakao) { map.current.setCenter(new window.kakao.maps.LatLng(37.5295, 126.931)); map.current.setLevel(5); } }} aria-label="여의도 중심으로 이동">⌖</button></div>
      <div className="map-bottom"><article className="floating-card route-card"><div className="card-top"><span className="card-icon mint"><Icon name="route" /></span><span className="sample-label">카카오 경로</span></div><h3>경로별 정보 비교</h3><p>{selectedStation ? `${selectedStation.name} → ${destination || "목적지"}` : "대여소와 목적지를 선택해 주세요."}</p>{routes.map((route) => <div className="route-result" key={route.mode}><strong style={{ color: route.mode === "BIKE_ONLY" ? "#14a77d" : "#427bd2" }}>{route.mode === "BIKE_ONLY" ? "● 자전거도로 우선" : "┄ 최단 경로"}</strong><span>{(route.distance / 1000).toFixed(1)}km · 약 {Math.ceil(route.duration / 60)}분<br />사고다발지역 {accidentStatus || !accidentYear ? "조회 불가" : `${nearAccidents.filter((area) => area.matches.some((match) => match.mode === route.mode)).length}곳`}</span></div>)}{routes.length > 0 && <p className="station-updated">사고지역 중심점과 경로선 사이 200m 이내 · {accidentYear ?? "연도 미확인"}년 기준</p>}{routes.length > 0 && <p className="station-updated">출처: 카카오맵 · 조회: {routeUpdated ? fetchedTime(routeUpdated) + " (한국시간)" : "시각 미확인"}</p>}{routeStatus && <p className="station-status">{routeStatus}</p>}<p className="station-updated">거리와 과거 사고 건수만으로 경로의 안전성을 판단할 수 없습니다.</p></article>
        <article className="floating-card weather-card"><div className="card-top"><span className="card-icon yellow"><Icon name="weather" /></span><span className="sample-label">기상청 단기예보</span></div><h3>출발지 날씨 예보</h3><p>{originPoint ? origin : "출발지를 검색해 선택해 주세요."}</p>{originPoint && weather ? <><div className="weather-info"><strong>{weather.temperature}<span>°C</span></strong><div><b>강수확률 {weather.precipitationProbability}%</b><small>격자 {weather.nx}, {weather.ny}</small></div></div><p className="station-updated">발표시각: {weatherTime(weather.baseDate, weather.baseTime)}<br />예보시각: {weatherTime(weather.forecastDate, weather.forecastTime)} (한국시간)<br />출처: 기상청 단기예보 · 예보값</p></> : originPoint && <p className="station-status" role="status">{weatherStatus}</p>}</article>
        <article className="floating-card station-card"><div className="card-top"><span className="card-icon coral"><Icon name="alert" /></span><span className="sample-label">{accidentYear ? `${accidentYear}년 기준` : "과거 사고정보"}</span></div><h3>경로 주변 사고다발지역</h3><p>경로 선에서 200m 이내 중심점 · 과거 통계</p>{accidentStatus ? <p className="station-status" role="status">{accidentStatus}</p> : routes.length === 0 ? <p className="station-status">경로를 조회하면 주변 지역이 표시됩니다.</p> : nearAccidents.length === 0 ? <p className="station-status">해당 기준으로 집계된 지역이 없습니다.</p> : <div className="accident-list">{nearAccidents.map((area) => <button key={area.id} onClick={() => { if (map.current && window.kakao) { map.current.setCenter(new window.kakao.maps.LatLng(area.lat, area.lng)); map.current.setLevel(3); } }}><strong>{area.name}</strong><small>{area.count}건 · {area.matches.map((match) => `${match.mode === "BIKE_ONLY" ? "자전거도로 우선" : "최단"} ${Math.round(match.distance)}m`).join(" / ")}</small></button>)}</div>}<p className="station-updated">출처: <a href="https://opendata.koroad.or.kr/api/selectBicycleDataSet.do" target="_blank" rel="noreferrer">한국도로교통공단</a>{accidentUpdated && <> · 조회: {fetchedTime(accidentUpdated)} (한국시간)</>}</p></article></div>
      <div className="map-credit">SAFE BIKE SEOUL <span>·</span> 안전한 이동을 위한 작은 습관</div>
    </section></div></main>;
}


