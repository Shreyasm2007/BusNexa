// NightRoute India-wide route discovery. All generated services, schedules,
// fares and vehicle movement are DEMO data until an operator/GPS API is connected.
export const routes = [
  { serviceNo:"KA-01-501", name:"CityLink Express", type:"AC Express", distance:165, stops:[{name:"Majestic, Bengaluru",lat:12.9767,lng:77.5713,mins:0},{name:"Silk Board, Bengaluru",lat:12.9177,lng:77.6233,mins:35},{name:"Electronic City, Bengaluru",lat:12.8452,lng:77.6602,mins:65},{name:"Hosur",lat:12.7409,lng:77.8253,mins:110},{name:"Krishnagiri",lat:12.5186,lng:78.2137,mins:155}], times:["02:35","04:44","07:18","11:26","15:43","19:12","22:37"] },
  { serviceNo:"KA-01-782", name:"MetroConnect", type:"Non-AC", distance:42, stops:[{name:"Majestic, Bengaluru",lat:12.9767,lng:77.5713,mins:0},{name:"Shantinagar, Bengaluru",lat:12.9581,lng:77.6001,mins:15},{name:"BTM Layout, Bengaluru",lat:12.9166,lng:77.6101,mins:28},{name:"Silk Board, Bengaluru",lat:12.9177,lng:77.6233,mins:38},{name:"Electronic City, Bengaluru",lat:12.8452,lng:77.6602,mins:60}], times:["01:25","04:44","06:55","09:32","12:18","15:47","18:26","21:53"] },
  { serviceNo:"KA-01-930", name:"SouthLine", type:"AC", distance:186, stops:[{name:"Majestic, Bengaluru",lat:12.9767,lng:77.5713,mins:0},{name:"Shantinagar, Bengaluru",lat:12.9581,lng:77.6001,mins:18},{name:"Electronic City, Bengaluru",lat:12.8452,lng:77.6602,mins:55},{name:"Hosur",lat:12.7409,lng:77.8253,mins:100},{name:"Krishnagiri",lat:12.5186,lng:78.2137,mins:145}], times:["03:18","06:42","10:15","13:37","17:24","20:46","23:12"] }
];
export const formatTime = date => date.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
export function atStopTime(base, mins, journeyDate) { const [h,m]=base.split(":").map(Number); const d=new Date(`${journeyDate}T00:00:00`); d.setHours(h,m+mins,0,0); return d; }

const haversineKm=(a,b)=>{const rad=x=>x*Math.PI/180,dLat=rad(b.lat-a.lat),dLon=rad(b.lng-a.lng),x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};
// Candidate intermediate towns are waypoints for road-route discovery only.
// They are NOT evidence that a scheduled bus operator serves these towns.
const corridorTowns = [
  {name:"Mandya",lat:12.5218,lng:76.8951},
  {name:"Maddur",lat:12.5823,lng:77.0425},
  {name:"Ramanagara",lat:12.7150,lng:77.2800},
  {name:"Malavalli",lat:12.3850,lng:77.0600},
  {name:"Kanakapura",lat:12.5460,lng:77.4200},
  {name:"Channapatna",lat:12.6510,lng:77.2060},
  {name:"Tumakuru",lat:13.3409,lng:77.1010},
  {name:"Hassan",lat:13.0068,lng:76.0996},
  {name:"Chikkamagaluru",lat:13.3161,lng:75.7720},
  {name:"Kolar",lat:13.1367,lng:78.1292},
  {name:"Chittoor",lat:13.2172,lng:79.1003},
  {name:"Vellore",lat:12.9165,lng:79.1325},
  {name:"Salem",lat:11.6643,lng:78.1460},
  {name:"Erode",lat:11.3410,lng:77.7172},
  {name:"Tiruppur",lat:11.1085,lng:77.3411},
  {name:"Krishnagiri",lat:12.5186,lng:78.2137},
  {name:"Hosur",lat:12.7409,lng:77.8253}
];
const pointToSegmentKm=(p,a,b)=>{
  const lat0=(a.lat+b.lat+p.lat)/3*Math.PI/180;
  const x=q=>q.lng*Math.cos(lat0), y=q=>q.lat;
  const ax=x(a), ay=y(a), bx=x(b), by=y(b), px=x(p), py=y(p);
  const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/den)):0;
  return {crossTrackKm:Math.hypot(px-(ax+t*dx),py-(ay+t*dy))*111.32,along:t};
};
const routeSignature=route=>route.coordinates.filter((_,i,a)=>i===0||i===a.length-1||i%Math.max(1,Math.floor(a.length/10))===0).map(p=>p.map(v=>v.toFixed(3)).join(",")).join("|");
const normalizeOsrmRoute=r=>({
  coordinates:compactPath(r.geometry.coordinates.map(([lng,lat])=>[Number(lat),Number(lng)])),
  distanceKm:Math.round(r.distance/1000),
  durationMinutes:Math.max(1,Math.round(r.duration/60)),
  roadNames:[...new Set((r.legs||[]).flatMap(l=>(l.steps||[]).map(st=>st.name).filter(Boolean)))].slice(0,8),
  viaName:r.viaName||""
});

const knownPlaces={
  // Exact transport hubs used in the Majestic (Kempegowda Bus Station) → Ballari test.
  "majestic":[12.97679,77.57260],"majestic, bengaluru":[12.97679,77.57260],"majestic bus stand":[12.97679,77.57260],"kempegowda bus station":[12.97679,77.57260],"kempegowda bus stand":[12.97679,77.57260],"ksrtc majestic":[12.97679,77.57260],
  "ballari":[15.1394,76.9214],"ballari, karnataka":[15.1394,76.9214],"ballari, india":[15.1394,76.9214],"bellary":[15.1394,76.9214],"bellary, karnataka":[15.1394,76.9214],"ballari bus stand":[15.1463,76.92774],"ballari new bus stand":[15.13736,76.91885],
  "koorgalli":[12.3407,76.6068],"koorgalli, mysuru":[12.3407,76.6068],"hootagalli":[12.3508,76.6061],"hebbal, mysuru":[12.3520,76.6250],"metagalli":[12.3426,76.6398],"bengaluru":[12.9716,77.5946],"bangalore":[12.9716,77.5946],"mysuru":[12.2958,76.6394],"mysore":[12.2958,76.6394],"chennai":[13.0827,80.2707],"hyderabad":[17.385,78.4867],"mumbai":[19.076,72.8777],"pune":[18.5204,73.8567],"delhi":[28.6139,77.209],"new delhi":[28.6139,77.209],"kochi":[9.9312,76.2673],"cochin":[9.9312,76.2673],"thiruvananthapuram":[8.5241,76.9366],"mangaluru":[12.9141,74.856],"hubballi":[15.3647,75.124],"vijayawada":[16.5062,80.648],"goa":[15.2993,74.124],"kolkata":[22.5726,88.3639],"jaipur":[26.9124,75.7873],"ahmedabad":[23.0225,72.5714],"surat":[21.1702,72.8311],"nagpur":[21.1458,79.0882],"lucknow":[26.8467,80.9462],"bhopal":[23.2599,77.4126],"indore":[22.7196,75.8577],"coimbatore":[11.0168,76.9558],"madurai":[9.9252,78.1198],"tiruchirappalli":[10.7905,78.7047],"visakhapatnam":[17.6868,83.2185],"bhubaneswar":[20.2961,85.8245],"guwahati":[26.1445,91.7362],"patna":[25.5941,85.1376],"ranchi":[23.3441,85.3096],"dehradun":[30.3165,78.0322],"amritsar":[31.634,74.8723],"chandigarh":[30.7333,76.7794],"varanasi":[25.3176,82.9739],"agra":[27.1767,78.0081],"jodhpur":[26.2389,73.0243],"udaipur":[24.5854,73.7125],"shimla":[31.1048,77.1734],"darjeeling":[27.041,88.2663],"tirupati":[13.6288,79.4192],"rameswaram":[9.2881,79.3129],"manali":[32.2396,77.1887],"dhanbad":[23.7957,86.4304],"guntur":[16.3067,80.4365]
};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ROUTE_HISTORY_KEY="nr_verified_route_history_v4";
// Invalidate older route caches: earlier versions could contain straight-line or mis-geocoded paths.
try { localStorage.removeItem("nr_verified_route_history_v1"); localStorage.removeItem("nr_verified_route_history_v2"); localStorage.removeItem("nr_verified_route_history_v3"); } catch {}
const readRouteHistory=()=>{
  try {
    const rows=JSON.parse(localStorage.getItem(ROUTE_HISTORY_KEY)||"[]");
    return Array.isArray(rows) ? rows.filter(x=>x && x.key && Array.isArray(x.routes) && Date.now()-Number(x.savedAt)<30*24*60*60*1000).slice(-8) : [];
  } catch { return []; }
};
const writeRouteHistory=(entry)=>{
  try {
    // Keep no more than 8 recent origin/destination pairs and at most 180 points per path.
    const routes=(entry.routes||[]).map(route=>({...route,coordinates:compactPath(route.coordinates||[]).filter((_,i,a)=>i%Math.max(1,Math.ceil(a.length/180))===0||i===a.length-1)}));
    const history=readRouteHistory().filter(x=>x.key!==entry.key);
    history.push({...entry,routes});
    localStorage.setItem(ROUTE_HISTORY_KEY,JSON.stringify(history.slice(-8)));
  } catch (error) {
    // Clear stale cache if quota is exhausted; never fail the active route search.
    try { localStorage.removeItem(ROUTE_HISTORY_KEY); } catch {}
    console.warn("NightRoute: route cache skipped because browser storage is full.",error);
  }
};
const routeKey=(a,b)=>[`${a.lat.toFixed(4)},${a.lng.toFixed(4)}`,`${b.lat.toFixed(4)},${b.lng.toFixed(4)}`].join("|");
const pathEndpointsMatch=(path,a,b)=>Array.isArray(path)&&path.length>1&&haversineKm({lat:path[0][0],lng:path[0][1]},a)<3&&haversineKm({lat:path.at(-1)[0],lng:path.at(-1)[1]},b)<3;
const compactPath=path=>{if(path.length<=900)return path;const step=Math.ceil(path.length/900);return path.filter((_,i)=>i%step===0||i===path.length-1);};
async function geocodeIndia(input){
  const place=String(input||"").trim(); if(!place) throw new Error("Enter a town, village or city name.");
  const key=place.toLowerCase().replace(/\s+/g," ");
  if(knownPlaces[key]) return {name:place,lat:knownPlaces[key][0],lng:knownPlaces[key][1]};
  // Never assume Karnataka: search the entire country and prefer populated places.
  const queries=[place,`${place}, India`]; let rows=[];
  for(const q of queries){
    try{
      const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&addressdetails=1&countrycodes=in&q=${encodeURIComponent(q)}`;
      const response=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(10000)});
      if(!response.ok) continue;
      rows=await response.json();
      if(rows.length) break;
    }catch{}
    await wait(1100);
  }
  if(!rows.length){
    // Secondary geocoder can find some smaller settlements missed by Nominatim.
    try{
      const photon=await fetch(`https://photon.komoot.io/api/?limit=10&q=${encodeURIComponent(place)}`,{signal:AbortSignal.timeout(10000)});
      if(photon.ok){const data=await photon.json();const feature=data.features?.find(f=>/india/i.test(f.properties?.country||""));if(feature){const [lng,lat]=feature.geometry.coordinates;return {name:feature.properties.name||place,fullName:[feature.properties.name,feature.properties.state,feature.properties.country].filter(Boolean).join(", "),lat:Number(lat),lng:Number(lng)};}}
    }catch{}
  }
  if(!rows.length) throw new Error(`Couldn't locate “${place}” in available India map databases. Add its district or nearest well-known town, or check the spelling.`);
  const normalise = value => String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
  const wanted = normalise(place.split(",")[0]);
  const ranked = rows.map(row => {
    const name = normalise(row.name || row.display_name.split(",")[0]);
    const address = row.address || {};
    const inIndia = String(address.country_code||"").toLowerCase()==="in" || /, India$/i.test(row.display_name||"");
    const exact = name === wanted;
    const starts = name.startsWith(wanted) || wanted.startsWith(name);
    const settlement = ["city","town","village","hamlet","municipality","suburb"].includes(String(row.type||"").toLowerCase());
    const population = Number(row.extratags?.population || row.population || 0);
    return {row, score:(inIndia?1000:0)+(exact?500:starts?180:0)+(settlement?80:0)+Math.min(50,Math.log10(Math.max(1,population))*8)};
  }).filter(x => Number.isFinite(Number(x.row.lat)) && Number.isFinite(Number(x.row.lon)) && x.score>=1000).sort((a,b)=>b.score-a.score);
  const row = ranked[0]?.row;
  if(!row) throw new Error(`Couldn't confidently resolve “${place}” to an Indian place. Add its district or state (for example, “${place}, Karnataka”).`);
  return {name:(row.name||row.display_name.split(",")[0]).trim(),fullName:row.display_name,lat:Number(row.lat),lng:Number(row.lon)};
}
function makeStops(origin,destination,coordinates,duration,viaStop=null){
  const points=[origin];
  // Intermediate route points are clearly labelled waypoints, not claimed bus stops.
  [0.2,0.4,0.6,0.8].forEach((fraction,i)=>{
    const index=Math.min(coordinates.length-1,Math.max(0,Math.round((coordinates.length-1)*fraction)));
    const [lat,lng]=coordinates[index];
    if(lat&&lng) points.push({name:`Map waypoint ${i+1} (approx.)`,lat,lng,mins:Math.round(duration*fraction),isWaypoint:true});
  });
  if(viaStop&&Number.isFinite(viaStop.lat)&&Number.isFinite(viaStop.lng)){
    let nearestIndex=0,nearestDistance=Infinity;
    coordinates.forEach(([lat,lng],i)=>{const dist=haversineKm(viaStop,{lat,lng});if(dist<nearestDistance){nearestDistance=dist;nearestIndex=i;}});
    const fraction=coordinates.length>1?nearestIndex/(coordinates.length-1):0.5;
    points.push({name:`${viaStop.name} (route waypoint)`,lat:viaStop.lat,lng:viaStop.lng,mins:Math.round(duration*fraction),isWaypoint:true});
  }
  points.sort((a,b)=>a.mins-b.mins);
  points.push({...destination,mins:duration});
  return points;
}
export async function createIndiaWideDemoBuses(fromText,toText){
  const origin=await geocodeIndia(fromText); await wait(1100);
  const destination=await geocodeIndia(toText);
  const airKm=haversineKm(origin,destination);
  if(airKm<2) throw new Error("Choose two different locations at least 2 km apart.");
  if(airKm>2000) throw new Error("These locations are already more than 2,000 km apart in a straight line, so a road journey will exceed the 2,000 km limit.");
  let roadRoutes=[],roadNote="Road route not loaded";
  const historyKey=routeKey(origin,destination);
  const prior=readRouteHistory().find(x=>x.key===historyKey&&Date.now()-x.savedAt<30*24*60*60*1000);
  if(prior?.routes?.length && prior.routes.every(r=>pathEndpointsMatch(r.coordinates,origin,destination))){
    roadRoutes=prior.routes;
    roadNote="Previously retrieved OpenStreetMap road routes · local route history";
  } else {
    try{
      const url=`https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&alternatives=3&steps=true`;
      const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error("OSRM unavailable");
      const data=await response.json();
      if(data.code==="Ok"&&data.routes?.length){
        roadRoutes=data.routes.filter(r=>r.geometry?.coordinates?.length>1).map(normalizeOsrmRoute)
          .filter(r=>pathEndpointsMatch(r.coordinates,origin,destination)&&r.distanceKm>=Math.round(airKm*.95)&&r.distanceKm<=2000);
      }

      // Ask OSRM for additional roads via real mapped intermediate towns near
      // the origin-destination corridor. Limit requests to three candidates.
      // These remain route previews, not proof of an operating bus service.
      const corridorLimit=Math.min(65,Math.max(22,airKm*.10));
      const candidates=corridorTowns.map(t=>({...t,...pointToSegmentKm(t,origin,destination)}))
        .filter(t=>t.along>.12&&t.along<.88&&t.crossTrackKm<=corridorLimit);
      // One waypoint near the direct corridor plus up to two farther corridor
      // towns encourages genuinely different road corridors, not three stops
      // on the same highway.
      const nearest=[...candidates].sort((a,b)=>a.crossTrackKm-b.crossTrackKm)[0];
      const chosen=nearest?[nearest]:[];
      const diverse=[...candidates].filter(t=>t!==nearest).sort((a,b)=>b.crossTrackKm-a.crossTrackKm);
      for(const candidate of diverse){
        if(chosen.length>=3) break;
        if(chosen.every(x=>haversineKm(x,candidate)>18)) chosen.push(candidate);
      }
      const waypointRoutes=await Promise.all(chosen.map(async town=>{
        try{
          const routeUrl=`https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${town.lng},${town.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true`;
          const response=await fetch(routeUrl,{signal:AbortSignal.timeout(15000)});
          if(!response.ok)return null;
          const data=await response.json();
          const route=data.code==="Ok"?data.routes?.[0]:null;
          if(!route?.geometry?.coordinates?.length)return null;
          const normalized=normalizeOsrmRoute({...route,viaName:town.name});
          normalized.viaLat=town.lat; normalized.viaLng=town.lng;
          return pathEndpointsMatch(normalized.coordinates,origin,destination)&&normalized.distanceKm<=2000?normalized:null;
        }catch{return null;}
      }));
      roadRoutes=[...roadRoutes,...waypointRoutes.filter(Boolean)];
      // Remove duplicates and paths that are implausibly long for the same OD pair.
      roadRoutes=roadRoutes.filter(r=>r.distanceKm>=Math.round(airKm*.95)&&r.distanceKm<=Math.max(2000,airKm*2.2));
      roadRoutes=roadRoutes.filter((r,i,all)=>all.findIndex(x=>routeSignature(x)===routeSignature(r))===i);
      roadRoutes.sort((a,b)=>a.durationMinutes-b.durationMinutes);
      if(roadRoutes.length>1){
        const fastest=roadRoutes[0];
        const shortest=[...roadRoutes].sort((a,b)=>a.distanceKm-b.distanceKm)[0];
        const viaOptions=roadRoutes.filter(r=>r.viaName).sort((a,b)=>b.distanceKm-a.distanceKm);
        const ordered=[fastest,shortest,...viaOptions,...roadRoutes];
        roadRoutes=ordered.filter((r,i,all)=>all.findIndex(x=>routeSignature(x)===routeSignature(r))===i).slice(0,3);
      } else roadRoutes=roadRoutes.slice(0,1);
      roadNote="OpenStreetMap / OSRM road geometry. Alternative corridors are road-route previews; not verified operator itineraries.";
      if(roadRoutes.length) writeRouteHistory({key:historyKey,from:origin.name,to:destination.name,savedAt:Date.now(),routes:roadRoutes});
    }catch(error){
      console.warn("BusNexa route discovery:",error);
    }
  }
  if(!roadRoutes.length) throw new Error("A road route could not be retrieved from the map router. Please retry later; no straight-line route will be shown.");
  roadRoutes=roadRoutes.filter(r=>r.distanceKm<=2000);
  if(!roadRoutes.length) throw new Error("No road route found within the supported distance limit.");
  const serviceBrands=["NightRunner Travels","BluePeak Express","Southern Star Bus","RoadKing Mobility","SwiftWay Coaches","Highland Transit","CityBridge Coaches","RouteOne Mobility"];
  const schedules=["02:35","04:44","07:18","11:26","15:43","19:12","22:37"];
  const buses=[];
  roadRoutes.forEach((route,routeIndex)=>{
    const stops=makeStops(origin,destination,route.coordinates,route.durationMinutes,route.viaName?{name:route.viaName,lat:route.viaLat,lng:route.viaLng}:null);
    const offsetMinutes=routeIndex*20;
    const routeTimes=schedules.map(base=>{
      const [hh,mm]=base.split(":").map(Number);
      const dt=new Date(2000,0,1,hh,mm+offsetMinutes);
      return `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
    });
    const corridorLabel=route.viaName?`Via ${route.viaName}`:
      routeIndex===0?"Fastest road corridor":routeIndex===1?"Shortest road corridor":`Alternative road corridor ${routeIndex+1}`;
    [
      {type:"AC Sleeper",rate:2.15,brand:serviceBrands[(routeIndex*2)%serviceBrands.length]},
      {type:"Non-AC Seater",rate:1.35,brand:serviceBrands[(routeIndex*2+1)%serviceBrands.length]}
    ].forEach((coach,coachIndex)=>buses.push({
      serviceNo:`NR-${String(100000+routeIndex*20+coachIndex*7+Math.floor(Math.random()*9))}`,
      name:coach.brand,type:coach.type,farePerKm:coach.rate,distance:route.distanceKm,journeyDistance:route.distanceKm,
      stops,times:routeTimes,routeCoordinates:route.coordinates,roadNote,isGenerated:true,routeVariant:routeIndex+1,
      durationMinutes:route.durationMinutes,routeLabel:corridorLabel,
      roadNames:route.roadNames||[],routeHistoryUsed:Boolean(prior),viaName:route.viaName||""
    }));
  });
  return buses;
}
