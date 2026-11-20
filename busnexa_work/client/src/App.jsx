import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import QRCode from "qrcode";
import { routes, atStopTime, formatTime, createIndiaWideDemoBuses } from "./data";

const API = "http://localhost:5000/api";
const token = () => localStorage.getItem("sb_token");
const SERVICE_STORE = "nr_demo_services_v3";
const safeRead = (key, fallback = []) => { try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value ?? fallback; } catch { return fallback; } };
const readServices = () => {
  const rows = safeRead(SERVICE_STORE, []);
  return Array.isArray(rows) ? rows : [];
};
// Persist only a small, compact service index. Full route geometry stays in memory
// while the search result is open; never write hundreds of full polylines to localStorage.
const compactService = bus => ({
  serviceNo: bus.serviceNo, name: bus.name, type: bus.type, from: bus.from, to: bus.to,
  departure: bus.departure, arrival: bus.arrival, departureDateTime: bus.departureDateTime,
  durationMinutes: bus.durationMinutes, journeyDistance: bus.journeyDistance,
  routeLabel: bus.routeLabel, routeVariant: bus.routeVariant,
  stops: (bus.stops || []).slice(0, 12).map(({name,lat,lng,mins}) => ({name,lat,lng,mins})),
  routeCoordinates: (bus.routeCoordinates || []).filter((_,i,a) => i % Math.max(1,Math.ceil(a.length/80)) === 0 || i === a.length-1)
});
const saveServices = list => {
  try {
    const compact = list.filter(x => x && x.serviceNo).map(compactService);
    const unique = [...new Map(compact.map(x => [x.serviceNo, x])).values()].slice(-30);
    localStorage.setItem(SERVICE_STORE, JSON.stringify(unique));
    // Remove the oversized v2 registry left by earlier app versions.
    localStorage.removeItem("nr_demo_services_v2");
    return true;
  } catch (error) {
    try { localStorage.removeItem(SERVICE_STORE); localStorage.removeItem("nr_demo_services_v2"); } catch {}
    console.warn("BusNexa: service history could not be persisted; current search remains available.", error);
    return false;
  }
};
// One-time migration cleanup: old versions stored up to 150 full route objects.
try { localStorage.removeItem("nr_demo_services_v2"); } catch {}
const fareBreakdown = (distance, busType="AC") => { const km = Math.max(0, Number(distance || 0)); const rate = /non.?ac/i.test(busType) ? 1.15 : 1.65; const base = Math.max(35, Math.round(km * rate)); const gst = Math.round(base * 0.05); const reservation = 15; const convenience = Math.round(base * 0.02); return { base, gst, reservation, convenience, total: base + gst + reservation + convenience }; };
const money = amount => `₹${Number(amount).toLocaleString("en-IN")}`;
const bookingBlockReason = (bus, now = Date.now()) => {
  const distanceKm = Number(bus?.journeyDistance ?? bus?.distance ?? 0);
  if (!Number.isFinite(distanceKm) || distanceKm < 100) return "Online booking is available only for journeys of 100 km or more.";
  const departureMs = bus?.departureDateTime ? new Date(bus.departureDateTime).getTime() : NaN;
  if (!Number.isFinite(departureMs)) return "A valid departure time is required before booking.";
  const hoursBeforeDeparture = (departureMs - now) / 3600000;
  if (hoursBeforeDeparture < 3) return "Booking closes 3 hours before departure. This service can no longer be booked online.";
  return "";
};
// Conventional Indian coach layouts: 2+2 for seater coaches and 2+1 for sleeper coaches.
// These are representative layouts, not verified layouts for a named operator/fleet.
const seatPlanFor = _type => ({kind:"seater",label:"40-seat · 2 + aisle + 2 layout",seats:Array.from({length:10},(_,i)=>[`${i+1}A`,`${i+1}B`,`${i+1}C`,`${i+1}D`]).flat()});

// Stable survey-informed crowd-risk flags for the demo map; not live passenger counts.
function crowdHotspotIndexes(bus) {
  const count = (bus?.stops || []).length;
  if (count < 3) return [];
  const candidates = Array.from({ length: count - 2 }, (_, i) => i + 1);
  const hash = String(bus?.serviceNo || "BUS").split("").reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const first = candidates[hash % candidates.length];
  if (candidates.length < 3 || hash % 2 !== 0) return [first];
  const second = candidates[(hash + Math.max(1, Math.floor(candidates.length / 2))) % candidates.length];
  return second === first ? [first] : [first, second];
}
async function request(path, options={}) {
  const res = await fetch(API + path, { signal: options.signal || AbortSignal.timeout(15000), ...options, headers: { "Content-Type":"application/json", ...(token()?{Authorization:`Bearer ${token()}`} : {}), ...(options.headers||{}) }});
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}
const busIcon = L.divIcon({
  className:"nr-bus-icon",
  html:`<div class="nr-bus-shell" aria-label="Bus position"><svg viewBox="0 0 48 48" role="img" aria-hidden="true"><path d="M10 8h28a5 5 0 0 1 5 5v21a4 4 0 0 1-4 4h-2v3h-5v-3H16v3h-5v-3H9a4 4 0 0 1-4-4V13a5 5 0 0 1 5-5Z" fill="#eafffb" stroke="#063b39" stroke-width="2"/><path d="M10 13h28v14H10z" fill="#173b4b"/><path d="M13 16h9v8h-9zm13 0h9v8h-9z" fill="#74f2dc"/><path d="M7 30h34v5H7z" fill="#39d9bc"/><circle cx="14" cy="36" r="3.2" fill="#07111f" stroke="#a9fff0" stroke-width="1.5"/><circle cx="34" cy="36" r="3.2" fill="#07111f" stroke="#a9fff0" stroke-width="1.5"/><path d="M5 18H2m44 0h-3" stroke="#ffe08a" stroke-width="2.5" stroke-linecap="round"/></svg></div>`,
  iconSize:[48,48],iconAnchor:[24,24]
});

function MapFit({ points }) {
  const map = useMap();
  useEffect(() => { if (points.length) map.fitBounds(points.map(p=>[p.lat,p.lng]), {padding:[35,35]}); }, [points, map]);
  return null;
}

function FollowBus({ position }) {
  const map = useMap();
  useEffect(() => {
    if (Number.isFinite(position?.lat) && Number.isFinite(position?.lng)) {
      map.panTo([position.lat, position.lng], { animate:true, duration:0.35 });
    }
  }, [position?.lat, position?.lng, map]);
  return null;
}

function TrackingMap({ bus, fromIndex, toIndex, replayProgress = null }) {
  const [clock,setClock] = useState(Date.now());
  const [loopProgress,setLoopProgress] = useState(0);
  const [roadPath,setRoadPath] = useState([]);
  const [roadStatus,setRoadStatus] = useState(bus.routeCoordinates?.length ? (bus.roadNote || "Road path estimate") : "Finding road route…");
  const segment = (bus.stops || []).slice(fromIndex,toIndex+1);
  const points = segment.length ? segment : (bus.stops || []);

  // Curated services previously joined stop coordinates with straight lines.
  // Ask OSRM for a road-following path through each selected stop instead.
  useEffect(()=>{
    let cancelled=false;
    if(bus.routeCoordinates?.length){ setRoadPath(bus.routeCoordinates); setRoadStatus(bus.roadNote || "Road path estimate"); return ()=>{cancelled=true;}; }
    const valid=points.filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));
    if(valid.length<2){setRoadPath([]);setRoadStatus("Road route unavailable");return ()=>{cancelled=true;};}
    setRoadStatus("Finding road route…");
    const coords=valid.map(p=>`${Number(p.lng)},${Number(p.lat)}`).join(";");
    const url=`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
    fetch(url,{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok) throw new Error("Routing service unavailable");return r.json();}).then(data=>{
      if(cancelled)return;
      const route=data.code==="Ok"?data.routes?.[0]:null;
      if(route?.geometry?.coordinates?.length>1){setRoadPath(route.geometry.coordinates.map(([lng,lat])=>[lat,lng]));setRoadStatus("Road-following path estimate · OSRM");}
      else {setRoadPath([]);setRoadStatus("Road path unavailable · no straight-line substitute shown");}
    }).catch(()=>{if(!cancelled){setRoadPath([]);setRoadStatus("Road routing service unavailable · retry later");}});
    return ()=>{cancelled=true;};
  },[bus.serviceNo,bus.routeCoordinates,fromIndex,toIndex]);

  useEffect(()=>{
    setLoopProgress(0);
    const id=setInterval(()=>{setClock(Date.now());setLoopProgress(v=>(v+0.003)%1)},250);
    return()=>clearInterval(id);
  },[bus.serviceNo,fromIndex,toIndex]);

  const safePath=useMemo(()=>{
    const raw=roadPath.length>1?roadPath:(bus.routeCoordinates?.length?bus.routeCoordinates:[]);
    return raw.map(point=>Array.isArray(point)?[Number(point[0]),Number(point[1])]:[Number(point.lat),Number(point.lng)]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
  },[roadPath,bus.routeCoordinates,points]);

  const departedAt=bus.departureDateTime?new Date(bus.departureDateTime).getTime():0;
  const durationMs=Math.max(60,Number(bus.durationMinutes)||Math.max(60,(bus.stops.at(-1)?.mins||60)-(bus.stops[0]?.mins||0)))*60000;
  const elapsed=departedAt?Math.max(0,clock-departedAt):0;
  const isDeparted=Number.isFinite(replayProgress)?true:Boolean(departedAt&&elapsed>0);
  const liveProgress=Number.isFinite(replayProgress)?Math.max(0,Math.min(1,replayProgress)):(isDeparted?Math.min(1,elapsed/durationMs):loopProgress);

  // Interpolate by travelled road distance, not by vertex count, so speed stays smooth
  // even when OSRM returns many closely spaced points in some road sections.
  const pos=useMemo(()=>{
    if(!safePath.length)return null;
    if(safePath.length===1)return {lat:safePath[0][0],lng:safePath[0][1]};
    const rad=x=>x*Math.PI/180;
    const dist=(a,b)=>{const d1=rad(b[0]-a[0]),d2=rad(b[1]-a[1]);const q=Math.sin(d1/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(d2/2)**2;return 6371000*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));};
    const lengths=[];let total=0;
    for(let i=0;i<safePath.length-1;i++){const d=dist(safePath[i],safePath[i+1]);lengths.push(d);total+=d;}
    let target=Math.max(0,Math.min(1,liveProgress))*total;
    for(let i=0;i<lengths.length;i++){
      if(target<=lengths[i]||i===lengths.length-1){const f=lengths[i]>0?Math.min(1,target/lengths[i]):0;return {lat:safePath[i][0]+(safePath[i+1][0]-safePath[i][0])*f,lng:safePath[i][1]+(safePath[i+1][1]-safePath[i][1])*f};}
      target-=lengths[i];
    }
    return {lat:safePath.at(-1)[0],lng:safePath.at(-1)[1]};
  },[safePath,liveProgress]);
  const fitPoints=useMemo(()=>safePath.map(([lat,lng])=>({lat,lng})),[safePath]);
  const mapCenter=fitPoints[0]||{lat:12.97,lng:77.59};
  return <div className="map-wrap"><MapContainer key={bus.serviceNo} center={[mapCenter.lat,mapCenter.lng]} zoom={7} scrollWheelZoom className="map">
    <FollowBus position={pos}/><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><MapFit points={fitPoints}/>
    {safePath.length>1&&<><Polyline positions={safePath} pathOptions={{color:"#42e8d0",weight:13,opacity:.16}}/><Polyline positions={safePath} pathOptions={{color:"#42e8d0",weight:5,opacity:.98,dashArray:"10 12",className:"animated-route"}}/></>}
    {points.map((p,i)=>{
      const isCrowded=crowdHotspotIndexes(bus).includes(i);
      const stopProgress=durationMs>0?Math.max(0,Math.min(1,Number(p.mins||0)*60000/durationMs)):0;
      const crossed=isDeparted&&liveProgress>=stopProgress;
      const isCurrent=isDeparted&&!crossed&&liveProgress>=Math.max(0,stopProgress-0.035);
      const fill=crossed?"#42e8d0":isCurrent?"#ffe18a":isCrowded?"#ef4444":"#60758a";
      return <CircleMarker key={`${p.name}-${i}`} center={[p.lat,p.lng]} radius={isCrowded?8:(i===0||i===points.length-1?8:5)} pathOptions={{color:"#07111f",weight:2,fillColor:fill,fillOpacity:1}}>
        <Popup>{p.name}{crossed?" · crossed":isCurrent?" · bus approaching":""}{isCrowded?" · crowd-risk indicator (survey-informed demo, not live count)":""}</Popup>
      </CircleMarker>;
    })}
    {safePath.length>1&&pos&&<Marker position={[pos.lat,pos.lng]} icon={busIcon}><Popup>Single simulated bus position. Completed stops are marked as crossed. Live GPS is not connected.</Popup></Marker>}
  </MapContainer><div className="map-caption"><span className="pulse-dot"/> {Number.isFinite(replayProgress)?`7-DAY DEMO REPLAY · ${Math.round(liveProgress*100)}%`:isDeparted&&elapsed>=durationMs?"ARRIVED · END OF ROUTE":isDeparted?`DEPARTED · ESTIMATED POSITION ${Math.round(liveProgress*100)}% ALONG ROUTE`:`ANIMATED DEMO JOURNEY · ${Math.round(liveProgress*100)}%`} <span>•</span> {roadStatus} · OpenStreetMap</div></div>;
}

function WeekRouteReplay({ bus }) {
  const days = useMemo(() => Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-(6-i));
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    return { key, label:d.toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"}) };
  }), []);
  const [dayIndex,setDayIndex] = useState(6);
  const [progress,setProgress] = useState(0.42);
  const selectedDay = days[dayIndex];
  const stops = bus.stops || [];
  const durationMinutes = Math.max(1, Number(bus.durationMinutes) || (stops.at(-1)?.mins || 60));
  const distanceKm = Math.max(0, Number(bus.journeyDistance || bus.distance || 0));
  const elapsedMinutes = Math.round(durationMinutes * progress);
  const coveredKm = distanceKm * progress;
  const originalDeparture = bus.departureDateTime ? new Date(bus.departureDateTime) : new Date();
  const departureClock = `${String(originalDeparture.getHours()).padStart(2,"0")}:${String(originalDeparture.getMinutes()).padStart(2,"0")}`;
  const replayDeparture = new Date(`${selectedDay.key}T${departureClock}:00`);
  const replayBus = {...bus, departureDateTime: replayDeparture.toISOString()};
  const crowdIndexes = crowdHotspotIndexes(bus);
  return <section className="week-replay" aria-label="Previous seven day route replay">
    <div className="week-replay-head"><div><p className="eyebrow">SERVICE ROUTE HISTORY · {bus.serviceNo}</p><h3>Previous 7 days</h3><p className="muted">Drag the slider to move along the route and inspect estimated waypoint times and distance covered.</p></div><span className="demo-history-badge">DEMO REPLAY</span></div>
    <div className="week-days">{days.map((day,i)=><button type="button" key={day.key} className={`week-day ${dayIndex===i?"active":""}`} onClick={()=>{setDayIndex(i);setProgress(0.42);}}><b>{day.label}</b><small>{i===6?"Today":"Replay"}</small></button>)}</div>
    <div className="week-replay-map"><TrackingMap key={`${bus.serviceNo}-${selectedDay.key}`} bus={replayBus} fromIndex={bus.fromIndex??0} toIndex={bus.toIndex??stops.length-1} replayProgress={progress}/></div>
    <div className="replay-controls">
      <label htmlFor={`replay-${bus.serviceNo}`}>Route playback · {Math.round(progress*100)}%</label>
      <input id={`replay-${bus.serviceNo}`} type="range" min="0" max="100" step="1" value={Math.round(progress*100)} onChange={e=>setProgress(Number(e.target.value)/100)}/>
      <span className="muted">{selectedDay.label} · {selectedDay.key}</span>
    </div>
    <div className="replay-distance-summary">
      <article><small>DISTANCE COVERED</small><strong>{coveredKm.toFixed(1)} / {distanceKm.toFixed(1)} km</strong></article>
      <article><small>ESTIMATED ELAPSED TIME</small><strong>{Math.floor(elapsedMinutes/60)}h {elapsedMinutes%60}m</strong></article>
      <article><small>ESTIMATED ARRIVAL</small><strong>{formatTime(new Date(replayDeparture.getTime()+durationMinutes*60000))}</strong></article>
    </div>
    <div className="replay-stops-heading"><h4>Intermediate stop / waypoint timeline</h4><span>Times and kilometres update as you drag</span></div>
    <div className="replay-stop-list">
      {stops.map((stop,index)=>{
        const stopProgress=Math.max(0,Math.min(1,Number(stop.mins||0)/durationMinutes));
        const reached=progress>=stopProgress;
        const isNext=!reached && stops.slice(0,index).every((s,j)=>progress>=Math.max(0,Math.min(1,Number(s.mins||0)/durationMinutes)));
        const crowded=crowdIndexes.includes(index);
        const km=distanceKm*stopProgress;
        const time=formatTime(new Date(replayDeparture.getTime()+Number(stop.mins||0)*60000));
        return <article className={`replay-stop ${reached?"reached":""} ${isNext?"next":""}`} key={`${stop.name}-${index}`}>
          <span className={`replay-stop-dot ${crowded?"crowded":""}`}></span>
          <div className="replay-stop-name"><strong>{stop.name}</strong><small>{index===0?"Origin":index===stops.length-1?"Destination":stop.isWaypoint?"Approximate route waypoint":"Intermediate point"}{crowded?" · higher crowd-risk indicator":""}</small></div>
          <div className="replay-stop-time"><b>{time}</b><small>Estimated time</small></div>
          <div className="replay-stop-distance"><b>{km.toFixed(1)} km</b><small>Covered by this point</small></div>
          <span className="replay-stop-state">{reached?"Passed":isNext?"Next":"Ahead"}</span>
        </article>;
      })}
    </div>
    <p className="crowd-legend"><i></i> Red dot = a survey-informed crowd-risk illustration at an intermediate waypoint; it does not report live crowd levels or identify a confirmed bus stop.</p>
    <p className="demo-warning">Historical GPS records are not connected. This is a simulated replay of the saved road path. Intermediate points are estimated map waypoints, not verified bus stops; their times and distance figures are estimates, not recorded arrivals.</p>
  </section>;
}
function Auth({ onLogin }) {
  const [mode,setMode]=useState("login"),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setError("");
    if(mode==="register" && password!==confirm){setError("Enter the same password in both password fields.");return;}
    setBusy(true);
    try { const data=await request(mode==="login"?"/auth/login":"/auth/register",{method:"POST",body:JSON.stringify({email,password})}); localStorage.setItem("sb_token",data.token);onLogin(data.user); }
    catch(err){setError(err.message)} finally{setBusy(false)}
  }
  return <main className="auth-shell"><div className="auth-glow"/><section className="auth-card">
    <div className="brand-mark">N<span>R</span></div><p className="eyebrow">URBAN MOBILITY, REIMAGINED</p><h1>{mode==="login"?"Welcome to BusNexa.":"Create your account."}</h1><p className="muted">Smart public bus journey discovery, made clearer.</p>
    <form onSubmit={submit}><label>Email address</label><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/><label>Password</label><input type="password" required minLength="8" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/>
    {mode==="register"&&<><label>Confirm password</label><input type="password" required value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Re-enter your password"/></>}
    {error&&<div className="error">{error}</div>}<button className="primary full" disabled={busy}>{busy?"Please wait…":mode==="login"?"Sign in":"Create account"} <span>↗</span></button></form>
    <p className="switch-auth">{mode==="login"?"New to BusNexa?":"Already have an account?"} <button onClick={()=>{setMode(mode==="login"?"register":"login");setError("")}}>{mode==="login"?"Create account":"Sign in"}</button></p>
    <p className="tiny-note">Demo project · Use a valid email and an 8+ character password.</p>
  </section></main>
}

function ServiceFeedback({ bus }) {
  return <section className="service-feedback">
    <div className="feedback-summary">
      <div><p className="eyebrow">PUBLIC TRANSPORT SURVEY INSIGHTS · {bus.serviceNo}</p><h3><span className="survey-stars">★★★★☆</span> 3.7 / 5</h3><p className="muted">Indicative satisfaction benchmark derived from a public BMTC survey — not a rating of this generated demo bus.</p></div>
      <span className="demo-warning">No verified service-specific reviews are available because the bus services in this prototype are simulated. The cards below summarize published commuter survey findings; they are not invented passenger quotes.</span>
    </div>
    <div className="survey-metrics">
      <article><strong>73%</strong><span>of 2,079 respondents were satisfied with BMTC services.</span><small>CAG Performance Audit, 2024</small></article>
      <article><strong>61%</strong><span>reported that BMTC buses were overcrowded.</span><small>CAG Performance Audit, 2024</small></article>
      <article><strong>90%</strong><span>identified economical fares or nearby bus stops as reasons for choosing BMTC.</span><small>CAG Performance Audit, 2024</small></article>
    </div>
    <div className="review-list survey-theme-list">
      <article><strong>Positive feedback theme · Affordability and access</strong><p>Survey respondents valued economical fares and bus stops located close to their source or destination.</p><small>Published survey finding — CAG Performance Audit on BMTC, section 3.12.</small></article>
      <article><strong>Improvement theme · Crowding and frequency</strong><p>Overcrowding and waiting time were identified as issues. The CAG report also records that 63% of respondents wanted bus frequency to increase.</p><small>Published survey findings — CAG Performance Audit on BMTC, sections 3.4 and 3.12.</small></article>
    </div>
    <p className="survey-source-links">Research sources: <a href="https://saiindia.gov.in/uploads/download_audit_report/2024/BMTC-CAG-Report-English-0675eb03cefc943.49495445.pdf" target="_blank" rel="noreferrer">CAG BMTC Performance Audit (2024)</a> · <a href="https://www.itdp.in/wp-content/uploads/2023/05/Transport4All-Stage-1-Analysis-of-Survey-Findings-1.pdf" target="_blank" rel="noreferrer">ITDP / Transport4All public transport survey</a> · <a href="https://www.janaagraha.org/resources/bus-stop-quality-survey/" target="_blank" rel="noreferrer">Janaagraha Bus Stop Quality Survey (2023)</a>.</p>
  </section>;
}
function App() {
  const [user,setUser]=useState(null),[page,setPage]=useState("search"),[profile,setProfile]=useState({name:"",phone:""}),[history,setHistory]=useState([]);
  const [from,setFrom]=useState("Majestic"),[to,setTo]=useState("Electronic City"),[date,setDate]=useState(new Date().toLocaleDateString("en-CA"));
  const [results,setResults]=useState(null),[selected,setSelected]=useState(null),[notice,setNotice]=useState(""),[trackNo,setTrackNo]=useState("");
  const [bookingBus,setBookingBus]=useState(null),[passengerName,setPassengerName]=useState(""),[mobile,setMobile]=useState(""),[selectedSeat,setSelectedSeat]=useState("");
  const [selectedSeats,setSelectedSeats]=useState([]),[passengerRows,setPassengerRows]=useState([]);
  const [paymentStage,setPaymentStage]=useState("details"),[paymentQr,setPaymentQr]=useState(""),[paymentRef,setPaymentRef]=useState("");
  const [bookedSeats,setBookedSeats]=useState([]),[seatLoading,setSeatLoading]=useState(false),[seatAvailability,setSeatAvailability]=useState({});
  const [profileMsg,setProfileMsg]=useState("");
  const [clockNow,setClockNow]=useState(Date.now());
  useEffect(()=>{const id=setInterval(()=>setClockNow(Date.now()),15000);return()=>clearInterval(id);},[]);
  useEffect(()=>{if(token())request("/me").then(u=>{setUser(u);setProfile(u)}).catch(()=>localStorage.removeItem("sb_token"))},[]);
  useEffect(()=>{if(user)request("/bookings").then(setHistory).catch(()=>{})},[user]);
  useEffect(()=>{
    if(!user || !results?.length) return;
    let active=true;
    Promise.all(results.map(async bus=>{
      try { const q=new URLSearchParams({serviceNo:bus.serviceNo,date,busType:bus.type}); return [bus.serviceNo,await request(`/bookings/seats?${q}`)]; }
      catch { return [bus.serviceNo,null]; }
    })).then(rows=>{if(active)setSeatAvailability(old=>({...old,...Object.fromEntries(rows)}));});
    return ()=>{active=false};
  },[user,results,date]);
  const stopNames=useMemo(()=>[...new Set(routes.flatMap(r=>r.stops.map(s=>s.name)))].sort(),[]);
  function logout(){localStorage.removeItem("sb_token");setUser(null);setSelected(null);setResults(null)}
  async function search(e){e.preventDefault();setNotice("Finding a route across India…");setSelected(null);setResults(null);
    const todayDate=new Date();todayDate.setHours(0,0,0,0);const maxDate=new Date(todayDate);maxDate.setMonth(maxDate.getMonth()+1);const selectedDate=new Date(`${date}T00:00:00`);
    if(!date||Number.isNaN(selectedDate.getTime())||selectedDate<todayDate||selectedDate>maxDate){setNotice("Please choose a journey date from today up to one month ahead.");return;}
    if(!from.trim()||!to.trim()){setNotice("Enter both starting and destination locations.");return;}
    if(from.trim().toLowerCase()===to.trim().toLowerCase()){setNotice("Choose two different locations.");return;}
    // Every search now uses the same live geocoding + road-routing pipeline.
    // Curated sample routes remain available for the Travel Guide only; they must
    // never short-circuit route discovery or display an unrelated path.
    try {
      const generatedRoutes=await createIndiaWideDemoBuses(from,to);
      const generatedServices=generatedRoutes.flatMap((generated,routeIndex)=>{
        const a=generated.stops[0],b=generated.stops.at(-1);
        return generated.times.map((base,index)=>{const dep=atStopTime(base,0,date),durationMinutes=generated.durationMinutes||Math.max(60,Math.round(generated.distance/45*60)),arr=atStopTime(base,durationMinutes,date);const stableKey=`${a.name}|${b.name}|${generated.type}|${generated.routeVariant||routeIndex}|${formatTime(dep)}`.toUpperCase();let hash=0;for(let k=0;k<stableKey.length;k++)hash=(hash*31+stableKey.charCodeAt(k))>>>0;const serviceNo=`NR-${String(100000+(hash%900000))}`;return {...generated,from:a.name,to:b.name,fromIndex:0,toIndex:generated.stops.length-1,departure:formatTime(dep),arrival:formatTime(arr),departureDateTime:dep.toISOString(),durationMinutes,journeyDistance:generated.distance,serviceNo,isGenerated:true,dataLabel:"DEMO SCHEDULE"};});
      });
      const nowMs=Date.now();
      const todayKey=new Date().toLocaleDateString("en-CA");
      // Keep today's buses that are still running (departed but not yet arrived)
      // plus all upcoming services. Hide only journeys already completed.
      const visibleServices=generatedServices.filter(bus=>{
        if(date!==todayKey) return true;
        const departureMs=new Date(bus.departureDateTime).getTime();
        const arrivalMs=departureMs+Math.max(1,Number(bus.durationMinutes)||60)*60000;
        return arrivalMs>nowMs;
      });
      const registry=readServices(); saveServices([...registry,...visibleServices]);
      visibleServices.sort((a,b)=>new Date(a.departureDateTime)-new Date(b.departureDateTime));setResults(visibleServices);setNotice(`${visibleServices.length} timetable examples are shown. Today’s active (departed but not yet arrived) and upcoming services are included. Road geometry is retrieved from OpenStreetMap/OSRM where available; service names, service numbers, schedules, fares and bus movement remain clearly labelled demo data because there is no single verified all-India live bus feed.`);
    } catch(err){setNotice(err.message||"Couldn't build a demo route. Try a more specific Indian city or bus stop.");}
  }

  async function openBooking(bus){
    const blocked=bookingBlockReason(bus,Date.now());
    if(blocked){setNotice(blocked);return;}
    setBookingBus(bus);
    setPassengerName(profile.name || user.name || "");
    setMobile(profile.phone || user.phone || "");
    setSelectedSeat("");setSelectedSeats([]);setPassengerRows([]);setBookedSeats([]);setSeatLoading(true);
    setPaymentStage("details");setPaymentQr("");setPaymentRef("");
    setNotice("");
    try {
      const qs=new URLSearchParams({serviceNo:bus.serviceNo,date,busType:bus.type});
      const data=await request(`/bookings/seats?${qs.toString()}`);
      setBookedSeats(data.bookedSeats||[]);setSeatAvailability(old=>({...old,[bus.serviceNo]:data}));if((data.availableCount??1)===0)setNotice("This bus is fully booked for the selected date. Choose another service.");
    } catch(err) { setNotice(`Could not load seat availability: ${err.message}`); }
    finally { setSeatLoading(false); }
  }
  async function confirmBooking(e){
    e.preventDefault();
    if(!bookingBus) return;
    const blocked=bookingBlockReason(bookingBus,Date.now());
    if(blocked){setNotice(blocked);setBookingBus(null);return;}
    if(!selectedSeats.length){setNotice("Select at least one available seat.");return;}
    if(passengerRows.length!==selectedSeats.length || passengerRows.some(p=>!p.name.trim()||!/^\d{10}$/.test(p.mobile))){setNotice("Enter a name and valid 10-digit mobile number for every selected seat.");return;}
    setPaymentStage("summary");
  }
  async function generateDemoPayment(){
    if(!bookingBus) return;
    const blocked=bookingBlockReason(bookingBus,Date.now());
    if(blocked){setNotice(blocked);setBookingBus(null);return;}
    const fare=fareBreakdown(bookingBus.journeyDistance,bookingBus.type);
    const ref=`NRPAY${Date.now().toString().slice(-8)}`;
    try {
      const qr=await QRCode.toDataURL(`NIGHTROUTE-DEMO-PAYMENT|REF:${ref}|AMOUNT:${fare.total*selectedSeats.length}|SERVICE:${bookingBus.serviceNo}`,{width:240,margin:2,color:{dark:"#07111f",light:"#ffffff"}});
      setPaymentRef(ref);setPaymentQr(qr);setPaymentStage("qr");
    } catch { setNotice("Could not create the demo QR. Please try again."); }
  }
  async function finishDemoPayment(){
    if(!bookingBus) return;
    const blocked=bookingBlockReason(bookingBus,Date.now());
    if(blocked){setNotice(blocked);setBookingBus(null);return;}
    try{
      const fare=fareBreakdown(bookingBus.journeyDistance,bookingBus.type);
      const departure= new Date(bookingBus.departureDateTime).toTimeString().slice(0,5);
      const bookings=[];
      for(let i=0;i<selectedSeats.length;i++){
        const person=passengerRows[i];
        const b=await request("/bookings",{method:"POST",body:JSON.stringify({serviceNo:bookingBus.serviceNo,from:bookingBus.from||from,to:bookingBus.to||to,date,departure,distanceKm:bookingBus.journeyDistance,passengerName:person.name,mobile:person.mobile,seatNo:selectedSeats[i],busType:bookingBus.type,fareAmount:fare.total,baseFare:fare.base,reservationFee:fare.reservation,gstAmount:fare.gst,convenienceFee:fare.convenience,paymentReference:paymentRef,paymentStatus:"Demo paid"})});bookings.push(b);
      }
      setHistory(h=>[...bookings,...h]);setBookingBus(null);setPaymentStage("details");setNotice(`${bookings.length} demo seat(s) confirmed on ${bookingBus.serviceNo}: ${bookings.map(b=>b.seatNo).join(", ")}. Total ${money(fare.total*bookings.length)}. No real money was transferred.`);
    }catch(e){setNotice(e.message)}
  }
  async function cancelBooking(booking){
    const group=history.filter(row=>row.status==="Confirmed (demo)" && row.serviceNo===booking.serviceNo && row.date===booking.date && row.paymentReference===booking.paymentReference);
    const candidates=group.length?group:[booking];
    const answer=window.prompt(`You have ${candidates.length} active seat(s) in this booking. How many seats do you want to cancel? Enter a number from 1 to ${candidates.length}.`,String(candidates.length));
    if(answer===null)return;
    const count=Number(answer);
    if(!Number.isInteger(count)||count<1||count>candidates.length){setNotice(`Enter a valid number between 1 and ${candidates.length}.`);return;}
    const chosen=candidates.slice(0,count);
    const departureAt=new Date(`${booking.date}T${booking.departure}:00+05:30`);
    const hoursLeft=(departureAt.getTime()-Date.now())/3600000;
    if(hoursLeft<=0){setNotice("This journey has already departed. It cannot be cancelled.");return;}
    const noRefund=hoursLeft<2;
    const deduction=hoursLeft>=72?10:hoursLeft>=24?25:50;
    const totalRefund=chosen.reduce((sum,row)=>{const base=Number(row.baseFare||row.fareAmount||0),fee=Number(row.reservationFee||0);return sum+(noRefund?0:Math.max(0,Math.round(Number(row.fareAmount||0)-base*deduction/100-fee)));},0);
    const confirmed=window.confirm(`Cancel ${count} seat(s) for ${booking.serviceNo}?\nSeats: ${chosen.map(x=>x.seatNo).join(", ")}\nTime before departure: ${hoursLeft.toFixed(1)} hours\n${noRefund?"Cancellation within 2 hours: no refund.":`Cancellation fee: ${deduction}% of basic fare + non-refundable reservation fee.`}\nEstimated total refund: ${money(totalRefund)}\nThe selected seats will be released. Continue?`);
    if(!confirmed)return;
    try{
      const updated=[];
      for(const row of chosen){const result=await request(`/bookings/${encodeURIComponent(row.id)}/cancel`,{method:"POST"});updated.push(result.booking);}
      setHistory(rows=>rows.map(row=>updated.find(x=>x.id===row.id)||row));
      setSeatAvailability({});
      setNotice(`${updated.length} seat(s) cancelled: ${updated.map(x=>x.seatNo).join(", ")}. ${money(updated.reduce((n,x)=>n+Number(x.refundAmount||0),0))} total refund status: ${noRefund?"No refund (within 2 hours)":"Marked as transferred to bank account (demo status only)"}. Seats are released for the same service. No real bank transfer occurred.`);
    }catch(error){setNotice(error.message||"Could not cancel the selected seats.");}
  }
  async function saveProfile(e){e.preventDefault();try{const u=await request("/me",{method:"PUT",body:JSON.stringify(profile)});setUser(u);setProfile(u);setProfileMsg("Profile updated successfully.");}catch(e){setProfileMsg(e.message)}}
  const today=new Date().toLocaleDateString("en-CA");
  const maxJourneyDate=(()=>{const d=new Date();d.setHours(0,0,0,0);d.setMonth(d.getMonth()+1);return d.toLocaleDateString("en-CA");})();
  if(!user)return <Auth onLogin={u=>{setUser(u);setProfile(u)}}/>;
  return <div className="app-shell">
    <aside className="sidebar"><div className="logo">N<span>R</span><small>BUSNEXA</small></div><div className="side-label">WORKSPACE</div>
      {[["search","⌕","Find a bus"],["track","◎","Track service"],["history","◷","Journey history"],["profile","◉","My profile"],["guide","✳","About & guide"]].map(([id,icon,label])=><button key={id} className={`nav-item ${page===id?"active":""}`} onClick={()=>{setPage(id);setNotice("")}}><b>{icon}</b>{label}</button>)}
      <div className="sidebar-bottom"><div className="avatar">{(user.name||user.email).slice(0,1).toUpperCase()}</div><div className="user-mini"><strong>{user.name||"Passenger"}</strong><small>{user.email}</small></div><button className="logout" onClick={logout} title="Sign out">↗</button></div>
    </aside>
    <main className="main-content"><header className="topbar"><div><span className="live-label"><i/> NETWORK STATUS: DEMO</span><span className="top-date">{new Date().toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</span></div><div className="top-right"><span className="avatar small-avatar">{(user.name||user.email).slice(0,1).toUpperCase()}</span><span>{user.name||"Passenger"}</span></div></header>
    {page==="search"&&<><section className="hero"><div><p className="eyebrow">SMART PUBLIC BUS TRANSPORT</p><h1>Find your route.<br/><em>Own your time.</em></h1><p className="muted">A clearer view of every journey, from first stop to last.</p></div><div className="hero-orbit"><div className="orbit-ring"/><span>✦</span><b>NR</b></div></section>
      <section className="search-panel"><div className="section-heading"><div><p className="eyebrow">ROUTE DISCOVERY</p><h2>Where are you headed?</h2></div><span className="step-tag">01 / SEARCH</span></div>
      <form className="search-grid" onSubmit={search}><div className="field"><label>FROM</label><input list="india-stops" value={from} onChange={e=>setFrom(e.target.value)} placeholder="City, bus stand or landmark" required/></div><button type="button" className="swap" onClick={()=>{setFrom(to);setTo(from)}} title="Swap locations">⇄</button><div className="field"><label>TO</label><input list="india-stops" value={to} onChange={e=>setTo(e.target.value)} placeholder="Destination in India" required/><datalist id="india-stops">{[...stopNames,"Bengaluru","Mysuru","Chennai","Hyderabad","Mumbai","Pune","Delhi","Kochi","Thiruvananthapuram","Mangaluru","Hubballi","Vijayawada","Goa","Kolkata","Jaipur"].map(s=><option key={s} value={s}/>)}</datalist></div><div className="field date-field"><label>JOURNEY DATE</label><input type="date" min={today} value={date} onChange={e=>{setDate(e.target.value);const chosen=new Date(`${e.target.value}T00:00:00`);if(e.target.value&&chosen>new Date(`${maxJourneyDate}T00:00:00`))setNotice("Journey search is limited to one month from today. Choose an earlier date.");else setNotice("");}} required/></div><button className="primary search-btn">Search buses <span>↗</span></button></form>
      {notice&&<div className="notice">{notice}</div>}</section>
      {results&&<section className="results-section"><div className="results-title"><div><p className="eyebrow">YOUR JOURNEY</p><h2>{from} <span>→</span> {to}</h2><p className="muted">{new Date(date+"T00:00:00").toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long",year:"numeric"})} · {results.length} services shown (scheduled + in-progress)</p></div><span className="step-tag">02 / SERVICES</span></div>
      {results.length===0?<div className="empty">No matching service for this route and date.</div>:<div className="bus-list">{results.map((bus,i)=>{const departureMs=new Date(bus.departureDateTime).getTime();const arrivalMs=departureMs+Math.max(1,Number(bus.durationMinutes)||60)*60000;const nowMs=clockNow;const departed=Number.isFinite(departureMs)&&nowMs>=departureMs&&nowMs<arrivalMs;const completed=Number.isFinite(arrivalMs)&&nowMs>=arrivalMs;const blockReason=bookingBlockReason(bus,nowMs);const eligible=!blockReason&&date>=today;return <article className={`bus-card ${selected?.serviceNo===bus.serviceNo&&selected?.departure===bus.departure?"chosen":""}`} key={bus.serviceNo+bus.departure}>
        <div className="bus-top"><div><span className="service-pill">{bus.serviceNo}</span><h3>{bus.name}</h3><p className="muted">{bus.type} · {bus.journeyDistance} km journey{bus.routeVariant?` · ${bus.routeLabel||`Route option ${bus.routeVariant}`}`:""}{bus.routeHistoryUsed?" · Saved path reused":""}</p><span className="demo-schedule-tag">DEMO SCHEDULE · NOT OPERATOR VERIFIED</span></div><span className={`status ${departed?"departed":completed?"completed":"scheduled"}`}>{departed?"Departed":completed?"Completed":"Scheduled"}</span></div>
        <div className="journey-line"><div><strong>{bus.departure}</strong><small>{from}</small></div><div className="line-mid"><span /><small>{Math.max(1,(bus.stops?.[bus.toIndex]?.mins??0)-(bus.stops?.[bus.fromIndex]?.mins??0))} min approx.</small></div><div className="align-right"><strong>{bus.arrival}</strong><small>{to}</small></div></div>
        <div className="bus-fare"><span>Estimated fare per passenger</span><strong>{money(fareBreakdown(bus.journeyDistance,bus.type).total)}</strong></div>
        <div className="bus-bottom"><span className="muted">Booking: {eligible?"Eligible":"Unavailable"}</span><div><button className="ghost" onClick={()=>setSelected(bus)}>View route & map</button><button className="primary compact" disabled={!eligible||!seatAvailability[bus.serviceNo]||seatAvailability[bus.serviceNo]?.availableCount===0} title={blockReason||"Booking available"} onClick={()=>openBooking(bus)}>{!eligible?"Booking unavailable":!seatAvailability[bus.serviceNo]?"Checking seats…":seatAvailability[bus.serviceNo]?.availableCount===0?"Fully booked":"Book journey"}</button></div></div>
        {!eligible&&<p className="eligibility-note">{blockReason||"Booking is unavailable for this journey date."}</p>}
      </article>})}</div>}</section>}
      {bookingBus&&<section className="booking-panel" id="booking-form"><div className="section-heading"><div><p className="eyebrow">PASSENGER DETAILS · {bookingBus.serviceNo}</p><h2>Complete your <span>booking.</span></h2><p className="muted">{from} → {to} · {date} · {bookingBus.departure}</p></div><button type="button" className="ghost" onClick={()=>setBookingBus(null)}>Cancel ×</button></div>
        <div className="booking-route-preview"><div className="preview-heading"><b>Journey navigation preview</b><span>Animated route · simulated vehicle</span></div><TrackingMap bus={bookingBus} fromIndex={bookingBus.fromIndex??0} toIndex={bookingBus.toIndex??bookingBus.stops.length-1}/><p className="muted">The bus marker animation previews the planned road path. It is not live GPS; real-time tracking requires a connected operator/device feed.</p></div>
        {paymentStage==="details"&&<form className="booking-grid" onSubmit={confirmBooking}>
          <div className="field"><label>PASSENGER NAME</label><input value={passengerName} onChange={e=>setPassengerName(e.target.value)} placeholder="Enter passenger name" required maxLength="80"/></div>
          <div className="field"><label>MOBILE NUMBER</label><input type="tel" value={mobile} onChange={e=>setMobile(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit mobile number" required inputMode="numeric" maxLength="10" minLength="10" pattern="[0-9]{10}" title="Enter exactly 10 digits."/></div>
          <div className="seat-area"><div><label>CHOOSE YOUR SEAT · {seatPlanFor(bookingBus.type).label.toUpperCase()}</label><p className="muted">{seatLoading?"Checking seats…":`${seatPlanFor(bookingBus.type).seats.length-(bookedSeats.length)} of ${seatPlanFor(bookingBus.type).seats.length} seats available · availability is specific to this service and date.`}</p></div><div className={`coach-layout ${seatPlanFor(bookingBus.type).kind}`}><div className="coach-front"><span>🚍 FRONT</span><span>DRIVER</span></div><div className="seat-grid">{seatPlanFor(bookingBus.type).seats.map((seat,index)=>{const blocked=bookedSeats.includes(seat);const chosen=selectedSeats.includes(seat);return <button type="button" key={seat} disabled={blocked||seatLoading} className={`seat ${chosen?"selected":""} ${blocked?"booked": ""}`} aria-pressed={chosen} aria-label={blocked?`Seat ${seat} already booked`:`Seat ${seat} available`} onClick={()=>{const next=chosen?selectedSeats.filter(x=>x!==seat):[...selectedSeats,seat];setSelectedSeats(next);setSelectedSeat(next[0]||"");setPassengerRows(next.map((x,i)=>passengerRows[selectedSeats.indexOf(x)]||{seat:x,name:"",mobile:""}));}}>{blocked?<><span>✕</span><small>BOOKED</small></>:<>{seat}<small>W</small></>}</button>})}</div><div className="coach-rear">REAR</div></div><div className="seat-legend"><span>Available</span><span className="chosen-legend">Selected</span><span className="booked-legend">Booked / blocked</span></div></div>
          <div className="booking-summary"><span>Journey distance <b>{bookingBus.journeyDistance} km</b></span><span>Service <b>{bookingBus.serviceNo}</b></span><span>Selected seats <b>{selectedSeats.join(", ")||"None"}</b></span><span>Passengers <b>{selectedSeats.length}</b></span></div>
          {selectedSeats.map((seat,i)=><div className="field passenger-entry" key={seat}><label>PASSENGER {i+1} · SEAT {seat}</label><input placeholder="Full name" value={passengerRows[i]?.name||""} onChange={e=>setPassengerRows(rows=>rows.map((p,j)=>j===i?{...p,name:e.target.value}:{...p}))}/><input placeholder="10-digit phone number" inputMode="numeric" maxLength="10" value={passengerRows[i]?.mobile||""} onChange={e=>setPassengerRows(rows=>rows.map((p,j)=>j===i?{...p,mobile:e.target.value.replace(/\D/g,"").slice(0,10)}:p))}/></div>)}
          <div className="fare-box"><strong>Total for {selectedSeats.length} passenger(s): {money(fareBreakdown(bookingBus.journeyDistance,bookingBus.type).total*selectedSeats.length)}</strong></div>
          <div className="fare-box"><h3>Fare estimate</h3>{(()=>{const f=fareBreakdown(bookingBus.journeyDistance,bookingBus.type);return <><span>Base fare <b>{money(f.base)}</b></span><span>GST (5%) <b>{money(f.gst)}</b></span><span>Reservation fee <b>{money(f.reservation)}</b></span><span>Convenience fee <b>{money(f.convenience)}</b></span><strong>Total payable <b>{money(f.total)}</b></strong></>})()}</div>
          <button className="primary booking-submit" disabled={!selectedSeats.length||seatLoading||seatPlanFor(bookingBus.type).seats.every(seat=>bookedSeats.includes(seat))}>Continue to payment <span>↗</span></button>
        </form>}
        {paymentStage==="summary"&&<div className="payment-panel"><p className="eyebrow">PAYMENT SUMMARY</p><h3>Review your total.</h3><div className="fare-box">{(()=>{const f=fareBreakdown(bookingBus.journeyDistance,bookingBus.type);return <><span>Base fare <b>{money(f.base)}</b></span><span>GST (5%) <b>{money(f.gst)}</b></span><span>Reservation fee <b>{money(f.reservation)}</b></span><span>Convenience fee <b>{money(f.convenience)}</b></span><strong>Total amount to pay ({selectedSeats.length} passengers) <b>{money(f.total*selectedSeats.length)}</b></strong></>})()}</div><p className="muted">Passengers: {selectedSeats.length} · Seats: {selectedSeats.join(", ")} · {bookingBus.serviceNo}</p><div className="payment-actions"><button className="ghost" type="button" onClick={()=>setPaymentStage("details")}>Back</button><button className="primary" type="button" onClick={generateDemoPayment}>Pay {money(fareBreakdown(bookingBus.journeyDistance,bookingBus.type).total*selectedSeats.length)} ↗</button></div></div>}
        {paymentStage==="qr"&&<div className="payment-panel qr-panel"><p className="eyebrow">DEMO PAYMENT QR</p><h3>Scan to view demo payment.</h3>{paymentQr&&<img className="payment-qr" src={paymentQr} alt="Demo payment QR code"/>}<strong className="qr-amount">{money(fareBreakdown(bookingBus.journeyDistance,bookingBus.type).total*selectedSeats.length)}</strong><p className="muted">Reference: {paymentRef}</p><div className="demo-warning">This is a demonstration QR only. It is NOT a UPI payment QR and cannot transfer money. No real payment is collected.</div><div className="payment-actions"><button className="ghost" type="button" onClick={()=>setPaymentStage("summary")}>Back</button><button className="primary" type="button" onClick={finishDemoPayment}>Complete demo payment</button></div></div>}
      </section>}
      {selected&&<section className="tracking-section"><div className="section-heading"><div><p className="eyebrow">SERVICE OVERVIEW · {selected.serviceNo}</p><h2>{selected.from} <span>→</span> {selected.to}</h2><p className="muted">{selected.departure?`Departure ${selected.departure} · Arrival ${selected.arrival||"estimated"} · `:""}Route stops and estimated vehicle position. {selected.routeHistoryUsed?"Reused from saved route history. ":""}Animated demo position; real GPS requires a connected operator/device feed.</p></div><button className="ghost" onClick={()=>setSelected(null)}>Close ×</button></div><div className="service-stats"><article><small>ESTIMATED AVERAGE TRAVEL TIME</small><strong>{Math.floor((selected.durationMinutes||0)/60)}h {(selected.durationMinutes||0)%60}m</strong></article><article><small>ROAD DISTANCE</small><strong>{selected.journeyDistance||selected.distance||"—"} km</strong></article><article><small>ROUTE VARIANT</small><strong>{selected.routeLabel||"Saved service path"}</strong></article></div><TrackingMap bus={selected} fromIndex={selected.fromIndex} toIndex={selected.toIndex}/><div className="stop-strip">{(selected.stops||[]).slice(selected.fromIndex??0,(selected.toIndex??(selected.stops||[]).length-1)+1).map((s,i)=><div className="stop-chip" key={s.name}><span className="stop-icon">🚌</span><strong>{s.name}</strong><small>{i===0?"Boarding stop":i===selected.toIndex-selected.fromIndex?"Destination":`Stop ${i+1}`} · {selected.departureDateTime?formatTime(new Date(new Date(selected.departureDateTime).getTime()+s.mins*60000)):"time estimate"}</small></div>)}</div><WeekRouteReplay bus={selected}/><ServiceFeedback bus={selected}/></section>}
    </>}
    {page==="track"&&<section className="page-section"><p className="eyebrow">LIVE SERVICE LOOKUP</p><h1>Track a <em>service.</em></h1><p className="muted">Enter a service number created by a route search on this browser to view its saved road path, estimated travel time and passenger feedback.</p><form className="track-search" onSubmit={e=>{e.preventDefault();const key=trackNo.trim().toLowerCase();const bus=[...readServices(),...routes].find(r=>String(r.serviceNo||"").toLowerCase()===key);if(bus && Array.isArray(bus.stops) && bus.stops.length>=2){const dep=bus.departureDateTime?new Date(bus.departureDateTime):new Date();const tracked={...bus,departureDateTime:dep.toISOString(),from:bus.from||bus.stops[0].name,to:bus.to||bus.stops.at(-1).name,fromIndex:bus.fromIndex??0,toIndex:bus.toIndex??bus.stops.length-1};setSelected(tracked);setNotice("Service found. Route map, estimated typical travel time and passenger feedback are shown below.");}else setNotice("Service number not found. Search a route first; its generated service numbers are saved on this device for tracking.");}}><input value={trackNo} onChange={e=>setTrackNo(e.target.value)} placeholder="e.g. KA-01-501"/><button className="primary">Track service ↗</button></form>{notice&&<div className="notice">{notice}</div>}{selected&&page==="track"&&<section className="tracking-section"><div className="section-heading"><div><p className="eyebrow">SERVICE DETAILS · {selected.serviceNo}</p><h2>{selected.from} <span>→</span> {selected.to}</h2><p className="muted">{selected.name} · {selected.type} · {selected.routeNote||selected.roadNote||"Road path saved from route search"}</p></div><button className="ghost" onClick={()=>setSelected(null)}>Close ×</button></div><div className="service-stats"><article><small>ESTIMATED AVERAGE TRAVEL TIME</small><strong>{Math.floor((selected.durationMinutes||0)/60)}h {(selected.durationMinutes||0)%60}m</strong></article><article><small>ROAD DISTANCE</small><strong>{selected.journeyDistance||selected.distance||"—"} km</strong></article><article><small>ROUTE VARIANT</small><strong>{selected.routeLabel||"Saved service path"}</strong></article></div><TrackingMap bus={selected} fromIndex={selected.fromIndex} toIndex={selected.toIndex}/><div className="stop-strip">{(selected.stops||[]).map((st,i)=><div className="stop-chip" key={`${st.name}-${i}`}><strong>{st.name}</strong><small>{i===0?"Origin":i===selected.stops.length-1?"Destination":"Route waypoint"}</small></div>)}</div><WeekRouteReplay bus={selected}/><ServiceFeedback bus={selected}/></section>}<div className="hint-card"><b>Try any Indian city pair</b><span>Bengaluru · Mysuru · Chennai · Hyderabad · Mumbai · Delhi · Kochi · Pune</span></div></section>}
    {page==="history"&&<section className="page-section"><p className="eyebrow">YOUR TRAVEL RECORD</p><h1>Journey <em>history.</em></h1><p className="muted">Your saved demo bookings appear here.</p>{history.length?<div className="history-list">{history.map(b=><article className="history-card" key={b.id}><div><span className="service-pill">{b.serviceNo}</span><h3>{b.from} → {b.to}</h3><p className="muted">{b.date} · {b.departure} · {b.distanceKm} km</p><p className="muted">Passenger: {b.passengerName||"—"} · Mobile: {b.mobile||"—"} · Seat: {b.seatNo||"—"}</p><p className="history-fare">Paid (demo): {money(b.fareAmount||0)}</p>{b.status==="Confirmed (demo)"&&<button className="cancel-booking" type="button" onClick={()=>cancelBooking(b)}>Cancel journey</button>}{b.status==="Cancelled"&&<p className="refund-line">Refund: {money(b.refundAmount||0)} · {b.refundStatus||"Demo refund calculated"}</p>}</div><div className="history-meta"><b>{b.id}</b><span>{b.status}</span></div></article>)}</div>:<div className="empty"><span>◷</span><h3>No journeys yet</h3><p>Your confirmed bookings will be collected here.</p><button className="primary" onClick={()=>setPage("search")}>Find a bus ↗</button></div>}</section>}
    {page==="profile"&&<section className="page-section"><p className="eyebrow">ACCOUNT SETTINGS</p><h1>Your <em>profile.</em></h1><p className="muted">Manage the details connected to your BusNexa account.</p><form className="profile-card" onSubmit={saveProfile}><label>EMAIL ADDRESS</label><input value={user.email} disabled/><label>FULL NAME</label><input value={profile.name||""} onChange={e=>setProfile({...profile,name:e.target.value})} placeholder="Your name"/><label>MOBILE NUMBER</label><input type="tel" inputMode="numeric" maxLength="10" minLength="10" pattern="[0-9]{10}" value={profile.phone||""} onChange={e=>setProfile({...profile,phone:e.target.value.replace(/\D/g,"").slice(0,10)})} placeholder="10-digit mobile number"/><button className="primary">Save changes ↗</button>{profileMsg&&<div className="notice">{profileMsg}</div>}</form></section>}
    {page==="guide"&&<section className="page-section">
      <p className="eyebrow">ABOUT THE APPLICATION</p><h1>About <em>BusNexa.</em></h1>
      <p className="muted">BusNexa — Smart Public Bus Transport System — is an academic web prototype designed to make bus journey information easier to explore in one place.</p>
      <div className="about-hero-card"><span className="about-mark">BN</span><div><h2>One place to explore your bus journey.</h2><p>Search routes, inspect road paths, understand estimated travel times and fares, replay a demonstration journey, and review public transport survey insights.</p></div></div>
      <div className="guide-grid">
        <article><b>01 · Find a route</b><p>Enter the origin, destination and travel date. The application resolves Indian place names and requests a road route where the public map service is available.</p></article>
        <article><b>02 · Compare services</b><p>View generated service options, route variants, estimated duration and distance-based demo fares. Different paths appear only when the routing provider returns alternatives.</p></article>
        <article><b>03 · Explore the map</b><p>Open a service to view the road path, origin and destination. The moving bus marker is a simulated animation, not a live GPS position.</p></article>
        <article><b>04 · Replay a journey</b><p>Choose a day from the previous-seven-day panel and drag the slider. The timeline estimates when each intermediate route waypoint is reached and how far the bus has travelled.</p></article>
        <article><b>05 · Understand crowd indicators</b><p>Red dots highlight one or two survey-informed demonstration crowd-risk waypoints. They are not live passenger counts and do not confirm that the point is an official bus stop.</p></article>
        <article><b>06 · Booking demonstration</b><p>Select seats, enter passenger details and view a demo payment QR. No real ticket is issued and no real payment is collected.</p></article>
      </div>
      <div className="cancellation-policy about-info">
        <p className="eyebrow">TECHNOLOGY USED</p><h2>How BusNexa works</h2>
        <div className="about-tech-grid">
          <article><b>React + Vite</b><p>Builds the interactive browser interface and runs the development server.</p></article>
          <article><b>Node.js + Express</b><p>Provides backend API routes for accounts, bookings, seat availability and cancellation.</p></article>
          <article><b>Leaflet + OpenStreetMap</b><p>Displays interactive maps, route geometry and map markers.</p></article>
          <article><b>OSRM + geocoding</b><p>Resolves locations and requests estimated road paths; results depend on external service availability.</p></article>
          <article><b>JSON files</b><p>Store small demonstration user and booking records on the backend. This is not a production database.</p></article>
          <article><b>Browser storage</b><p>Keeps a compact list of recently searched demo services and route history on this device.</p></article>
        </div>
      </div>
      <div className="cancellation-policy about-info">
        <p className="eyebrow">DATA TRANSPARENCY</p><h2>What is real and what is simulated?</h2>
        <p><b>Map road geometry:</b> retrieved from OpenStreetMap / OSRM when the service responds. OSRM's driving route is not a verified bus operator route.</p>
        <p><b>Intermediate points:</b> estimated map waypoints generated along the route. They are not confirmed boarding or alighting stops unless a verified stop feed is connected.</p>
        <p><b>Schedules, service numbers, operators, fares and vehicle movement:</b> generated demonstration data. The replay does not contain historical GPS observations.</p>
        <p><b>Survey stars and feedback:</b> public transport survey findings shown as an indicative benchmark, not actual reviews or ratings of the generated bus services.</p>
        <p><b>Seats and payments:</b> booking and QR flows are demonstrations. A real deployment requires an operator inventory feed and a regulated payment gateway.</p>
        <p><b>India-wide transport coverage:</b> there is no single public, complete, verified live timetable feed for every State Road Transport Undertaking and private operator. Public GTFS feeds are available for selected regions and operators only. BusNexa must import and validate each operator feed separately before showing its services as real.</p>
        <p><b>Known public data examples:</b> Delhi Open Transit Data publishes static GTFS (with approximate stop times) and requires authorisation for real-time vehicle positions; Telangana TGSRTC publishes static GTFS under its data terms; community-maintained feeds are also listed for selected systems such as Hubballi-Dharwad, Mumbai, Ahmedabad, Rajkot, Vapi and Chennai. These are separate feeds with different coverage and validity dates, not a complete nationwide feed. See DATA-SOURCES-AND-COVERAGE.md in the project folder.</p>
      </div>
      <div className="cancellation-policy about-info">
        <p className="eyebrow">PUBLIC TRANSPORT SURVEY BASIS</p><h2>Why crowd and feedback indicators are included</h2>
        <p>The Comptroller and Auditor General's 2024 performance audit of BMTC reports an online survey with 2,079 respondents; around 73% said they were satisfied with BMTC services, while 61% reported overcrowded buses. The report also records that 63% wanted increased bus frequency.</p>
        <p>The ITDP / Transport4All Stage-1 survey analysis reports crowding as a concern for bus stops and vehicles. Janaagraha's 2023 Bus Stop Quality Survey assessed 39 Bengaluru bus stops across accessibility, comfort, display and safety.</p>
        <p className="policy-note">These are public research findings used to inform general feedback themes and the illustrative crowd-risk overlay. They do not identify crowd levels at a particular stop on a particular day or provide ratings for a generated service.</p>
        <p className="survey-source-links"><a href="https://saiindia.gov.in/uploads/download_audit_report/2024/BMTC-CAG-Report-English-0675eb03cefc943.49495445.pdf" target="_blank" rel="noreferrer">Read CAG BMTC audit</a> · <a href="https://www.itdp.in/wp-content/uploads/2023/05/Transport4All-Stage-1-Analysis-of-Survey-Findings-1.pdf" target="_blank" rel="noreferrer">Read Transport4All survey analysis</a> · <a href="https://www.janaagraha.org/resources/bus-stop-quality-survey/" target="_blank" rel="noreferrer">Read Janaagraha bus stop survey</a>.</p>
      </div>
      <div className="cancellation-policy about-info">
        <p className="eyebrow">TRAVEL SMARTER</p><h2>Passenger guidance</h2>
        <div className="guide-grid">
          <article><b>Be stop-ready</b><p>Reach the confirmed boarding stop early and verify the service number and direction with the operator.</p></article>
          <article><b>Respect the ride</b><p>Offer priority seating, keep aisles clear, use headphones and be considerate of fellow passengers.</p></article>
          <article><b>Keep it safe</b><p>Hold handrails, never board or exit a moving bus, and keep personal belongings secure.</p></article>
          <article><b>Leave no trace</b><p>Keep the bus clean, avoid littering and do not obstruct doors or emergency exits.</p></article>
        </div>
      </div>
    </section>}
    <footer className="footer"><span>© 2026 BUSNEXA</span><span>MOVE SMARTER · TRAVEL BETTER</span><span>BUSNEXA · DEMO BUILD · ROUTE REPLAY</span></footer>
    </main>
  </div>
}
export default App;
