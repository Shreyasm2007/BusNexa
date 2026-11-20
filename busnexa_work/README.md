# NightRoute — India-wide Smart Bus Route Discovery (student demo)

React + Vite frontend and Node/Express backend. This build improves free-text location lookup, alternative road paths, intermediate map waypoints, AC/Non-AC demo coach variants, fare estimates and animated bus markers.

## Run on Windows / VS Code

Open this `nrfix` folder in VS Code. The easiest option is to double-click `START-NIGHTROUTE.bat`. It installs dependencies if missing and opens separate backend and frontend terminal windows. Visit `http://localhost:5173`. Keep both terminal windows open; the computer must remain awake and connected to the internet.

Manual start (two terminals):

Backend:
```powershell
cd server
npm install
npm start
```

Frontend:
```powershell
cd client
npm install
npm run dev -- --host 127.0.0.1
```

Backend health check: `http://localhost:5000/api/health`. The response includes process uptime.

### Keep processes alive after crashes (Windows)
Install PM2 once: `npm install --global pm2`
From the `nrfix` folder run:
```powershell
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs
pm2 restart all
pm2 stop all
```
PM2 automatically restarts a crashed frontend/backend process while Windows is running. It does not keep a laptop online while it is asleep, shut down, or disconnected. For public 24/7 availability, deploy to an always-on hosting provider and use a production web server rather than Vite's development server.

## Route search behaviour
- Enter Indian cities, towns, villages, bus stands or landmarks as free text.
- Location lookup tries OpenStreetMap Nominatim and then Photon as a fallback; known sample locations are cached in the project code.
- The app requests up to three alternative road paths from the public OSRM demo router.
- Each road path is shown with AC Sleeper and Non-AC Seater demo coach options, different illustrative operator/brand names and different fare-per-kilometre estimates.
- Intermediate map points are labelled **approximate route waypoints**. They are not confirmed bus stops. Do not present them as boarding points.
- Routes over 2,000 km are rejected with a suggestion to split the trip through an intermediate town/city.
- Road path, duration and distance depend on public map services and internet availability. A fallback straight-line-derived path is labelled approximate.

## Important: demo data, not live transport data
This is still a college demonstration, not a real bus booking or tracking network. Bus operators, service numbers, timetables, departure states, coach types, seat inventory and fares are generated examples. The moving bus icon is animated/simulated from schedule elapsed time; it is **not GPS tracking** and does not represent a real vehicle. AC and Non-AC fares are different illustrative estimates, not operator prices. The app cannot guarantee that a bus exists for every village-to-village pair.

To make this a real service, integrate authorized operator/aggregator inventory APIs for routes, actual service IDs, schedules, live seat counts and fares. Real GPS requires a live vehicle/device feed (for example, an operator AVL/GPS API) and permission to display it. Never label simulated movement as live GPS.

## Requirements
- Node.js 18+
- Internet connection for geocoding, road routing and map tiles

## Production work still required
Use a persistent database instead of JSON files; configure HTTPS, secure JWT secrets, validation and rate limiting; implement atomic seat holds; integrate verified transport inventory and payment providers; and connect authenticated GPS/AVL feeds. Public geocoding/routing services have usage policies and rate limits and are not guaranteed production infrastructure.

## Route history and booking navigation update

- Successful OpenStreetMap/OSRM road paths (up to three alternatives) are cached in the browser's local storage for 30 days. Repeated searches for the same resolved origin/destination can reuse the saved geometry and reduce repeated routing requests.
- The route cache stores road geometry, route distance and duration. It is a local optimisation/history cache, not an official transport operator route-history database.
- The booking form now includes an animated map preview of the selected route while the passenger chooses a seat.
- Bus movement remains simulated. Real GPS tracking, real operator schedules, fares, seat inventory and payment processing require authorized operator/GPS/payment integrations and are not included in this demo.
- Intermediate map points are approximate route waypoints unless a verified bus stop is explicitly supplied; do not treat every waypoint as a boarding stop.


## Seven-day service route replay

Opening a specific bus's route view now includes a seven-day replay panel. Choose a date and move the playback slider to animate that bus along its saved road geometry. This is a demonstration replay, not a record of where a real bus travelled. It uses the service's known route path and does not create or claim historical GPS observations. Actual past-week history and current live position require an authorized operator/device GPS or AVL feed with timestamped records, plus permission and a backend retention store.

## Reliability changes

- Added a Windows one-click launcher that keeps the backend and frontend in separate terminal windows.
- Added a PM2 process configuration with automatic restart on process failure.
- Added backend health uptime and configurable port.
- Added request timeouts for public geocoding and routing calls so a stalled external service does not leave route search waiting indefinitely.


## Latest update: cancellations and seat release

- Cancel a confirmed booking from **Journey History**. The confirmation dialog previews the fee and estimated refund.
- The backend verifies ownership, marks the booking cancelled, and releases the seat for other users.
- Refund slabs are based on the published KSRTC terms as a reference (10% / 25% / 50% cancellation fee, with no cancellation inside 2 hours; reservation fee non-refundable). See `CANCELLATION-AND-FARE-UPDATE.txt` for details and limitations.
- This is a demo refund calculation only. It does not send money back because no real payment gateway is connected.
- Seater layout is 2+2 with a centre aisle; fare minimum and route-distance validation have been reduced; departure times now use minute-specific schedules.


## BusNexa replay, crowd indicators and public survey update
- The previous-seven-day replay slider now updates estimated elapsed time, distance covered, and an intermediate waypoint timeline with estimated arrival times.
- Red map/timeline dots identify one or two illustrative crowd-risk waypoints. These are not live crowd measurements and the route points are not verified bus stops.
- The service feedback panel no longer accepts user-entered reviews. It summarizes published BMTC / Indian public-transport survey findings and labels the star-style display as an indicative benchmark, not a rating of a generated service.
- The About & guide tab explains the application, technologies, route replay, survey basis and simulated-data limitations.
- A destination endpoint bus marker is shown after departure; its popup clarifies that it is an endpoint marker, not the live bus position.
- Historical GPS is still not available. The seven-day panel replays saved road geometry only.

### Survey sources used in the interface
- CAG, Performance Audit on Functioning of BMTC (Report No. 4 of 2024), section 3.12: online survey of 2,079 respondents; approximately 73% overall satisfaction; 61% reported overcrowded buses; 63% wanted increased frequency.
- ITDP / Transport4All, Stage-1 Analysis of Survey Findings: public transport discomfort findings include crowding at stops and inside vehicles.
- Janaagraha, Bus Stop Quality Survey (2023): citizen-perception assessment of 39 Bengaluru bus stops across accessibility, comfort, display and safety.
These are system-level survey results, not reviews of individual generated demo buses or crowd counts at the map waypoints.
