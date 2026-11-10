# Rugo — on-demand freight

Rugo works like a ride-hailing app for freight. A **shipper** asks for a pickup and sees the price right away. A **carrier** accepts the load with one tap and assigns a driver. Both sides watch the truck move in real time until the receiver signs.

The interface follows Apple's design language: SF system fonts, large titles, frosted-glass bars, inset grouped lists, segmented controls, sheets, and full light and dark mode. It is built to be easy for people of any age. Every step has one clear main button, tap targets are large, and the wording is plain. A text-size setting (A / A+ / A++) is available on every screen.

## Three apps in one

| Who | What they do |
|---|---|
| **Shipper** (company with the load) | Requests a pickup in 4 steps (Where → What → When → Review) with an instant price. Tracks the truck live on a map with ETA. Compares pickup and delivery photos side by side. Chats with the driver and dispatch. Gets an invoice automatically and rates the carrier. |
| **Carrier dispatcher** (trucking company) | Sees a live **load board** sorted by $/km, closest truck or newest. Accepts loads instantly; the best driver/truck is suggested by trailer type and distance. Watches the live fleet map. Manages drivers (hourly or per-km pay) and trucks (odometer, L/100 km, service due). Logs fuel, and reads profit reports per job, driver, lane and truck. |
| **Driver** (phone) | Gets one big button per step: *Start driving → I'm at the pickup → take 6 inspection photos → Start delivery → I've arrived → photos + damage check + signature → Complete*. Arrival is detected automatically by a GPS geofence. Also covers fuel logging with a receipt photo, clock in and out, and Hours-of-Service meters (13 h driving / 14 h on duty). |

### Trucking features
- **Inspection photos:** the same 6 required shots at pickup and at delivery (trailer front, left, right, rear, cargo, seal), plus optional BOL and damage close-ups. Each photo is time-stamped and geotagged and compressed on the device before upload.
- **Kilometre tracking:** empty (deadhead) and loaded km are tracked separately from GPS, with optional odometer readings at pickup and at delivery.
- **Pricing:** rate card by trailer type, base fee + line haul per km + fuel surcharge, plus hazmat, liftgate and expedite options and HST. The **final invoice uses the GPS-tracked loaded km** plus detention (over 2 free hours at $75/h).
- **Job profit for the carrier:** payout minus driver pay (hours × hourly rate, or km × per-km rate), minus fuel, minus truck, insurance and upkeep cost per km. Fuel comes from linked receipts, or an estimate from the truck's L/100 km and the diesel price.
- **Fleet:** live positions, speed and heading; service-due warnings; fuel economy per truck; empty-km percentage.
- **Live updates everywhere** through Server-Sent Events: toasts like "Carrier found", "Your load is on the road", "Delivered — no damage".

## Run it

Requires Node 20+.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. The first start creates demo data. On the sign-in screen you can pick a role with one tap, or sign in with any demo email and the password `demo`:

| Role | Email |
|---|---|
| Shipper | `dana@northwind.com` (also `priya@maplesteel.ca`) |
| Dispatcher | `alex@velocityfreight.ca` |
| Driver | `marcus@velocityfreight.ca`, `aisha@velocityfreight.ca`, `wei@velocityfreight.ca`, … |

For production, build the web app and run the server on one port (`PORT`, default 4000):

```bash
npm run build && npm start
```

To clear all data and re-seed on the next start:

```bash
npm run reset
```

### One-file browser demo
```bash
npm run build:standalone
```
This writes `dist-standalone/rugo.html`, a single page with the server logic built in. It needs no backend. Data is kept in the viewer's own browser, and it uses a simplified offline map. Use it to share a quick demo. Use the Node server for real multi-company use.

### Public web link (GitHub Pages)
`npm run build:standalone` also writes `docs/index.html`, a complete web page. To publish it, go to GitHub → **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick this branch and the **/docs** folder, then save. The demo is then at `https://<owner>.github.io/<repo>/`. On a normal web host the real street map loads; inside sandboxed pages it falls back to the offline map.

### Google Maps
With a Google Maps Platform API key, Rugo uses Google for the live map, real road routes and kilometres (Routes API), and address search (Places API).
1. In Google Cloud Console, create a project, turn on billing, and enable **Maps JavaScript API**, **Routes API** and **Places API (New)**.
2. Create an API key and restrict it to your site (HTTP referrer), e.g. `https://<owner>.github.io/*`.
3. Use it in one of these ways:
   - Paste it into **Settings → Maps** (saved in that browser).
   - Build it into the page: `VITE_GOOGLE_MAPS_KEY=AIza… npm run build:standalone`.
   - For the Node server, set `GOOGLE_MAPS_API_KEY` (used for routing and passed to browsers).

Without a key, or where Google can't be reached, Rugo falls back to OpenStreetMap and its own route estimates.

### Driver GPS (driver app)
Every driver tracks with the Rugo app on their phone:
- **When it starts:** tracking starts on its own when the driver taps **Start** on a load or clocks in. There's no switch to turn on.
- **While it runs:** the app sends a position every 5 s, keeps the screen awake, and shows a "GPS tracking" chip.
- **When it stops:**
  - **When a load is delivered:** the shift that started with the load closes, and tracking stops with it. A manual clock-in stays open until the driver clocks out.
  - **When the driver signs out:** signing out clocks them out.
- **Dispatch alerts:**
  - If the driver blocks location, loses signal or signs out during a load, dispatch gets a "GPS stopped" alert.
  - The driver shows **GPS off** on the Drivers page.
- **Demo mode:** a truck that isn't sending GPS (or ELD) positions is driven along its route by the demo simulator. Switch the simulator off in Settings for real use.

Background tracking: a web app can only read GPS while it's open on screen. To keep tracking with the phone locked, package the app as a native app (for example with Capacitor and a background-geolocation plugin). It can post to the same `/api/driver/location` endpoint.

### ELD / hours of service (Samsara, Motive, Geotab, Isaac)
Rugo doesn't replace a certified ELD. It reads from the one a fleet already uses. Dispatch connects it in **Integrations** with these credentials:

| Provider | Credentials | Where to get them |
|---|---|---|
| Samsara | API token (read: Vehicles, Drivers, ELD Hours of Service, Vehicle Statistics). Region: NA or EU. | Samsara → Settings → API Tokens |
| Motive | API key | Motive Fleet Dashboard → Admin → API Keys |
| Geotab | Server, database, user, password (use a read-only service user) | MyGeotab → Users |
| Isaac Instruments | API URL + key | Your Isaac account manager (partner API) |
| Sandbox | none | Test data built from your own drivers and trucks |

What Rugo does with them:
- **Linking:** it links ELD vehicles to Rugo trucks automatically (by VIN, plate or unit number) and ELD drivers to Rugo drivers (by email, licence number or name). Any link can be changed, and unlinked records can be added as new trucks or drivers in one click.
- **Sync (every 60 s, plus webhooks):** duty status; remaining drive, shift and cycle time; time until the next break; GPS position; odometer (Samsara only). Samsara and Motive can also push webhooks to the URL shown in Integrations, which triggers an immediate sync.
- **Where the data shows up:**
  - an HOS table in Integrations;
  - an "Hours left (ELD)" column on Drivers;
  - official clocks on the driver's Hours screen;
  - hours left in the driver picker;
  - alerts in the bell and as toasts (under 1 h of driving left, break due, or driving past a limit).
- **Live positions:** ELD GPS positions drive the live map, km tracking and geofence arrivals, and the simulator leaves those trucks alone.
- **Credential safety:** credentials stay on the server and are never sent to the browser. URLs you type in (the Geotab server and Isaac API URL) must use https and can't point to private networks.

Browsers can't call ELD APIs directly, so real providers only work with the Node server. The one-file demo supports the Sandbox only.

Notes:
- **Isaac:** Isaac's partner API isn't public. `server/eld/isaac.js` uses common path and field names; check them against the docs Isaac gives you.
- **Testing against mocks:** set `RUGO_ELD_<PROVIDER>_URL` (e.g. `RUGO_ELD_SAMSARA_URL`) and `RUGO_ELD_ALLOW_LOCAL=1`.
- **Sync interval:** change it with `RUGO_ELD_SYNC_MS`.

### AI dispatch & driver scorecards
**AI dispatch.** `server/dispatch.js` ranks drivers for any load and gives each one a match score out of 100. The score is built from these weighted parts:
- **Distance to pickup (25):** measured from where the driver will actually start. If they're on a job, that's the next drop.
- **Timing and schedule (20):** whether they can make the pickup window, and whether it falls inside their shift.
- **Cost to run (20):** driver pay, fuel and truck cost, including the empty kilometres.
- **Lane history (15):** how often they've run this lane before.
- **Hours left (10):** ELD clocks, when an ELD is connected.
- **Scorecard (10):** their recent performance.

Some drivers can't be picked at all: no truck, licence expired, time off, out of hours, or busy. A trailer-type mismatch costs 20 points.

Choose the mode in **Settings → AI dispatch**:
- **Off:** you pick drivers yourself.
- **Suggest (default):**
  - every board load shows its best driver, with one-tap "Send";
  - the Accept, Replace driver and Add route screens list drivers ranked, with the reasons for each score.
- **Auto:** board loads that pay at least the minimum $/km and have a driver at or above the minimum match score are accepted and assigned automatically. This happens when the load arrives, and Rugo re-checks waiting loads every 30 s.

**Scorecards.** `server/scorecard.js` builds a scorecard per driver, shown on **Drivers → Scorecards** and in each driver's **Scorecard** tab. Choose 30 days, 90 days or 12 months. It covers:
- **Workload:** loads delivered and loads per week.
- **Punctuality:** on-time, early and late pickups and deliveries, measured against the appointment window, with average minutes late or early.
- **Responsiveness:** time from dispatch to the driver tapping Start.
- **Time:** paid hours, driving hours, paid time not moving and what it costs, and average time at the docks.
- **Money:** revenue, cost (driver pay and fuel), profit, margin and revenue per km.
- **Fuel:** fuel economy compared with the fleet, and the share of fill-ups with a receipt.
- **Quality & safety:** damage reports, HOS violations, photo and signature completeness, and cancellations.
- **Lanes:** the lanes they run most.

Each driver also gets a weighted score with a grade (A–F), a rank, a trend versus the previous period, and plain-language "Doing well" and "Work on" notes.

### Projected vs actual, and route changes
**Projected vs actual.** Every job's detail page compares projected time with actual time for each part of the trip: drive to pickup, loading, drive to delivery and unloading.
- **Projected time** is the fastest-route time from Google when a server key is set, otherwise from OSRM or an estimate. Loading and unloading are each allowed 1 hour.
- **Verdict:** each part is marked faster, about the same (within 15 min or 10%), a bit slower or way off (more than 45 min or 30% slower).
- **Kilometres:** planned and driven km are shown for each driving part.
- **Live loads** also show how far ahead of or behind plan they are.

**Route changes.** Every GPS, ELD or simulated position is checked against the planned route line. Two readings in a row off the line mark the truck as off-route.
- **Threshold:** 1.2 km away on a real road route, or 12 km when the route is only an estimate.
- **Alerts:** the office gets a "Driver changed route" alert immediately, and a "Back on the planned route" alert when the truck rejoins.
- **Where it shows:** in the bell, as "Off route" on the job list, in Live fleet, and as a red banner on the job map.
- **History:** each event is kept with a link to its location.

**Scorecards** gain three metrics: average drive time versus projected, trips that were way off, and the number of route changes.

### Internal chat
Use **Messages** (sidebar, or the tab bar in the driver app) for the office and its drivers.
- **Conversations:**
  - every driver has a private conversation with the office, and any dispatcher can answer it;
  - **group chats** for the drivers you pick. Create them with **+ New → New group**. You can name the group, pick drivers one by one or with shortcuts (Everyone, On shift now), and change members or rename it later with **Members**. Changes are posted in the chat;
  - **announcement channels** go to every driver, and only the office can post in them.
- **Live delivery:** messages arrive instantly (SSE) and show a pop-up that opens the conversation.
- **Unread counts** appear on the nav item and on each conversation.
- **Delivery and read receipts on every message you send:** ✓ Sent, ✓✓ Delivered (the recipient's app received it) and blue ✓✓ Read (they opened the conversation), each with its time. In groups it shows "Read by 3 of 5 · delivered to 4"; tap the status to see each person's delivered and read time.
- **Attachments:** photos (from the camera on phones) and a link to a load.
- **Quick replies** in one tap, such as "On my way", "Running late" and "At the dock".
- **On-shift status:** a green dot on a driver's picture (in Messages and Drivers) means they're on shift right now. The chat header shows "On shift since 6:02 a.m." or "Off shift · last on 3 h ago", and groups show how many members are on shift.
- **Calling:** the office can call the driver, and drivers can call the office.
- **Starting a chat:** the Chat button on Drivers, in each driver's details, and in Live fleet opens that driver's conversation.

### Phones and tablets
Rugo works in Safari and Chrome on iPhone, Android, iPad and Android tablets. It has been tested at iPhone SE, iPhone 14 Pro Max, Pixel 7, iPad Mini and iPad Pro landscape sizes.
- **Layouts:**
  - **Phones:** a bottom tab bar with four main tabs plus **More** for every other page.
  - **iPad portrait:** the phone layout, with Messages shown as two panes side by side.
  - **iPad landscape and desktops:** the sidebar.
- **Phone-friendly details:**
  - no sideways scrolling;
  - form text is 16 px so iPhones don't zoom in;
  - larger tap targets on touch screens;
  - the calendar opens in Day view.
- **Home-screen app:** add it with **Share → Add to Home Screen** (iPhone/iPad) or **⋮ → Add to Home screen / Install app** (Android). It then opens full-screen with the Rugo icon.

### Driver steps on a job
A driver taps one big button at each step. A step tracker shows At pickup → Loading → On the road → Delivered → Off-loaded → Ended.
1. **I'm at the pickup.** This also happens automatically by geofence.
2. **Loading.** Tap when the dock starts loading. The time waited at the dock is recorded for detention.
3. **Loaded — start trip.** Needs the pickup photos.
4. **Gas stop** (any time while driving). It pauses the trip, and the truck shows as stopped. The driver logs the fill-up with a receipt photo right there, and saving it puts them back on the road.
5. **Delivered — I'm at the customer.** This also happens automatically by geofence.
6. **Off-loaded.** Needs the delivery photos and the damage answer.
7. **End job.** Needs the receiver's signature. It closes the load, sends proof of delivery and ends the load's shift.

Each step is added to the load's timeline. Loading, gas stops and off-loading also notify the office, and the customer is told about loading and off-loading.

### Weather at every truck
Rugo checks the live weather where each truck is, using Open-Meteo, a free weather service that needs no key. It checks every 10 minutes, and again whenever a truck moves 15 km.
- **Shown on:**
  - hovering any truck on any map (conditions, temperature, feels-like, wind and gusts, and the time of the reading);
  - "Weather where your trucks are" on the office dashboard, worst conditions first;
  - Live fleet rows and the truck panel;
  - the load page;
  - the driver's job screen;
  - the customer's live loads.
- **Rough-weather warnings:** freezing rain or drizzle, snow, fog, thunderstorms, gusts of 50 km/h or more, and extreme cold. These turn amber or red, show road advice (for example "black ice likely" or "chains may be needed"), appear under "Needs attention", and notify the office when a truck on a load runs into them.
- **Right-click any map** (long-press on phones) for an Apple-Weather-style card:
  - **On a truck:** the weather where it is right now.
  - **On a truck's route, ahead of it:** the forecast for the moment that truck will get there (for example "When Unit 101 gets here · ~5:40 p.m., 86 km ahead"). If the truck has already passed, it shows the weather there now.
  - **Anywhere else:** the weather there now.
  - The card shows custom multicolour weather icons on a sky-coloured background, with feels-like, wind, gusts and precipitation. The dashboard's truck weather tiles use the same style. Forecasts are available up to 2 days ahead.
- **When the service can't be reached:** if the simulator is on, as in the offline demo, trucks show clearly-labelled sample weather instead. Set `RUGO_WEATHER_URL` to use another provider that has the same API.

### Dashboards
Each kind of user lands on a live dashboard:
- **Office (carrier):**
  - **Headline numbers:** moving now, new loads waiting, overdue pickups, delivered today, revenue today, drivers on shift and unread messages.
  - **Live map:** every truck and active load, coloured by stage. Problem loads show in red and new board loads as pins. Filters: Everything, Moving, Problems, New loads.
  - **Needs attention:** overdue or late pickups, deliveries at risk, off-route trucks, GPS off, detention running, loads waiting for a carrier, HOS, licences, overdue service and old unpaid invoices.
  - **Panels:** today's pickups and deliveries with status; new loads with a one-tap send to the best driver; a live activity feed.
  - **Charts:** fleet status, loads by stage, revenue for the last 7 days, and today's on-time % and drivers on shift.
  - **Driver strip:** each driver's progress.

  The load board moved to `/board`.
- **Driver ("Today"):**
  - shift status with clock in or out, and the current or next job with progress and ETA;
  - a to-do list (start the job, photos, signature, deliver, messages, hours, documents);
  - hours left today as gauges (from the ELD when connected), plus km and earnings this week;
  - the week's schedule and coming loads;
  - anything missed in the last 7 days: late stops, route changes, scheduled days with no shift, unread office messages.

  The job screen moved to `/job`.
- **Customer (shipper):**
  - on the road, arriving today, finding a carrier, delivered this month and spend;
  - a live map of all their loads, with a progress bar and ETA for each;
  - a gallery of the pickup and delivery photos for each load, showing who signed and any damage;
  - weekly shipments and spend, on-time %, and open invoices.

### Reports (company owners)
**Reports** (in Fleet) covers any period: this or last week, this or last month, the last 30 or 90 days, this quarter, year to date, or a custom range. Every number is compared with the previous period of the same length.
- **Summary:** 12 headline numbers with change arrows, "Where we're doing really well" and "Where we can improve" talking points, a profit trend, and meeting notes that print with the report.
- **Money:** profit and loss (revenue, detention, driver pay, fuel, truck cost), each as a share of revenue and per km. It also has a trend chart and table, receivables with aging, and unpaid invoices.
- **Payroll:** gross pay per driver, a weekly pay register and CSV export.
  - Hourly drivers are paid for on-duty hours, with overtime at ×1.5 after 60 h in a week.
  - Per-km drivers are paid for km driven.
  - Also shown per driver: driving vs non-driving hours, pay per load, and pay as a share of the revenue they brought in.
- **Drivers:** scorecard table and a talking point for each driver.
- **Trucks:** per unit revenue, profit, revenue per km, utilization, fuel, L/100 km and when service is due.
- **Operations:** on-time pickups and deliveries, dock time, drive time vs projected, and empty km. Lists the late stops, trips way over plan, route changes, damage claims and cancellations.
- **Fuel:** spend, litres, average $/L, receipt compliance, and breakdowns by truck and by station.
- **Customers & lanes:** revenue, rate per km, profit, margin and on-time % for each customer and each lane.

**Print report** lets you pick sections. It prints a cover header and each section on its own page; use "Save as PDF" to email it. CSV exports are available for loads and payroll.

### Maps & routing
- Map tiles come from CARTO/OpenStreetMap and change with light and dark mode.
- Road routes come from the public OSRM router. If it can't be reached, Rugo uses an estimated route with a road factor. Set `RUGO_OFFLINE_ROUTING=1` to always use the estimate.
- Address search shows saved places instantly and also looks up any address through OpenStreetMap Nominatim.

For heavy production use, point these at your own tile, routing and geocoding services.

## Architecture

```
server/            Node + Express API (no database server needed)
  index.js         REST routes, auth, uploads, SSE stream
  fleet.js         load lifecycle, rules, geofencing, ETA, realtime fan-out, simulator
  pricing.js       rate card, quotes, invoices, job economics
  dispatch.js      AI dispatch: driver ranking for a load
  scorecard.js     driver scorecards
  chat.js          internal chat: threads, messages, visibility
  eld/             ELD connectors (samsara, motive, geotab, isaac, sandbox) + sync engine
  geo.js           distance, bearing, OSRM routing with offline fallback
  db.js            durable JSON store (atomic writes) in ./data
  seed.js          demo companies, fleet, live + historic loads
src/               React (Vite) client
  lib/             store (bootstrap + SSE), api, router, formatting, geo, image compression
  components/      MapView (Leaflet), UI kit, inspection photos, signature, chat, charts
  pages/shipper    Home, Request pickup wizard, Shipments, Billing
  pages/carrier    Load board, Jobs, Live fleet, Drivers & trucks, Fuel, Reports
  pages/driver     My job (guided flow), Fuel, Hours & pay
```

Load status flow: `requested → accepted → en_route_pickup → at_pickup → in_transit → at_delivery → delivered` (or `cancelled`). The server enforces the rules. A load can't leave pickup until all 6 pickup photos are taken. It can't be marked delivered until the delivery photos, the damage answer and the receiver's signature are all in.

### Notes for going to production
- Swap the JSON store in `server/db.js` for PostgreSQL. Collections map 1:1 to tables.
- Move uploads in `data/uploads` to object storage (S3 or similar) with signed URLs.
- Add proper user invitations and SSO. Sessions are bearer tokens today.
- Add push notifications to the driver app (it already works as an installable PWA).
