BUSNEXA — INDIA BUS DATA SOURCES AND COVERAGE NOTES
===================================================

IMPORTANT STATUS
----------------
The current BusNexa search still creates DEMONSTRATION service cards and schedules. It uses OpenStreetMap/OSRM for road geometry when those services respond, but it does not yet import the timetable rows from the external GTFS feeds listed below. The service names, service numbers, departure times, coach types, fares and animated vehicle movement must therefore not be described as verified real operator data.

There is no single public, complete, verified, real-time bus timetable API covering every Indian state transport corporation and private bus operator. Each operator or state publishes data separately, some datasets require terms acceptance or an API key, and some feeds are community-maintained or out of date. A true all-India implementation needs a feed importer and per-operator validation, plus permission/access where required.

PUBLIC DATA SOURCES IDENTIFIED
------------------------------
1. Delhi Open Transit Data (official government portal)
   - Static GTFS is available as a ZIP with agency, route, trip, stop and stop-time tables.
   - Portal reports 3,464 stops, 543 routes, 16,562 trips and 378,324 stop-time rows in the published snapshot; the portal shows a last update of 20 June 2024.
   - The documentation warns that stop times are rough estimates generated using a constant-speed assumption.
   - Real-time vehicle-position API access requires an authorised private key.
   - Documentation: https://otd.delhi.gov.in/documentation/
   - Static data: https://otd.delhi.gov.in/data/static/
   - Real-time access: https://otd.delhi.gov.in/data/realtime/

2. Telangana State Road Transport Corporation (TGSRTC; official data publisher)
   - Publishes static GTFS for schedules, fares, routes and stops.
   - The feed is free and non-exclusive subject to TGSRTC's terms and attribution requirement.
   - TGSRTC states that it may update or discontinue access and does not guarantee that every change is reflected immediately.
   - Open-data page and terms: https://www.tgsrtc.telangana.gov.in/open-data
   - A feed record is also listed at: https://mobilitydatabase.org/feeds/gtfs/mdb-3361

3. Hubli-Dharwad BRTS (community feed listing)
   - Mobility Database lists a community GTFS feed with 373 routes and a service range shown as 24 August 2026 to 20 February 2027.
   - This is a community feed, not proof of a direct operator integration.
   - Feed listing: https://mobilitydatabase.org/feeds/gtfs/mdb-3141

4. Mumbai-area bus systems (community feed listing)
   - Mobility Database lists a community GTFS feed covering KDMT and BEST-related agencies, with 935 routes and a service range shown as 19 August 2026 to 15 February 2027.
   - Feed listing: https://mobilitydatabase.org/feeds/gtfs/mdb-3138

5. Other city feeds
   - A public India GTFS directory lists current or recently published feeds for selected areas including Ahmedabad, Rajkot, Vapi, Hubli-Dharwad, Mumbai/Pune and Chennai, alongside expired or unavailable feeds for some other operators.
   - Feed directory: https://sites.gtfs.zone/countries/in/
   - This directory is useful for discovery, but each feed's licence, producer, date range and validation status must be checked before use.

IMPLEMENTATION RULES FOR FUTURE FEED IMPORT
-------------------------------------------
- Import each GTFS ZIP separately and record its publisher, source URL, licence, retrieved date, feed start/end dates and validation status.
- Parse agency.txt, routes.txt, trips.txt, stops.txt, stop_times.txt, calendar.txt and calendar_dates.txt (and shapes.txt when available).
- Apply service calendars and exceptions for the selected travel date. Do not create departures by inventing fixed clock times.
- Match the user's origin/destination to actual feed stops and find trips that serve both stops in the correct sequence.
- Use actual stop_times for intermediate arrival/departure display. If stop times are estimated by the publisher, label them as estimates.
- Use shapes.txt when supplied for the bus route line. Road routing geometry from OSRM is not the same thing as an operator's actual bus route.
- Keep real-time GPS positions separate from static GTFS schedules. Only display live positions when a valid GTFS-Realtime or operator AVL feed is authorised and connected.
- Never invent an operator name, service number, fare, stop, passenger review or crowd count and present it as real.
- If no valid feed covers a searched location pair, show a clear "No verified operator timetable feed for this area" message or a separately labelled DEMO preview. Do not call a generated timetable a real service.

BOOKING POLICY IMPLEMENTED IN THIS UPDATE
-----------------------------------------
- Booking is available only for journeys of 100 km or more.
- Booking closes 3 hours before the scheduled departure.
- The client disables the booking button and explains the reason when either rule is not met.
- The backend independently enforces both rules, so sending a direct API request cannot bypass the policy.
- These are BusNexa prototype rules, not a claim that every Indian bus operator follows the same booking policy.


MULTI-CORRIDOR SEARCH UPDATE
---------------------------
The route engine now requests OSRM alternatives and can additionally request road geometry through selected mapped intermediate-town waypoints near the origin-destination corridor. It keeps up to three distinct road paths when the router returns them. The via-town waypoint is shown on the map and the corresponding route distance is used for the prototype's distance-based fare estimate. Sample departures for different route variants are staggered by 20 minutes.

This does NOT add verified bus operator schedules. The via-town path is a road-routing preview, not proof that an actual bus service operates through that town. The timetable, operator/service labels, fare rates and movement remain demo data until validated operator feeds and authorised vehicle-position feeds are integrated.
