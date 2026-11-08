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
  - **group chats** for the drivers you pick. Create them with **+ New → New group**. You can name the group, pick drivers one by one or with shortcuts (Everyone, On shift now, or by trailer type), and change members or rename it later with **Members**. Changes are posted in the chat;
  - **announcement channels** go to every driver, and only the office can post in them.
- **Live delivery:** messages arrive instantly (SSE) and show a pop-up that opens the conversation.
- **Unread counts** appear on the nav item and on each conversation.
- **Delivery and read receipts on every message you send:** ✓ Sent, ✓✓ Delivered (the recipient's app received it) and blue ✓✓ Read (they opened the conversation), each with its time. In groups it shows "Read by 3 of 5 · delivered to 4"; tap the status to see each person's delivered and read time.
- **Attachments:** photos (from the camera on phones) and a link to a load.
- **Quick replies** in one tap, such as "On my way", "Running late" and "At the dock".
- **On-shift status:** a green dot on a driver's picture (in Messages and Drivers) means they're on shift right now. The chat header shows "On shift since 6:02 a.m." or "Off shift · last on 3 h ago", and groups show how many members are on shift.
- **Calling:** the office can call the driver, and drivers can call the office.
- **Starting a chat:** the Chat button on Drivers, in each driver's details, and in Live fleet opens that driver's conversation.

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
