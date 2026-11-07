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

### Demo simulation vs. real GPS
In demo mode, trucks drive themselves along their route. A leg takes about 2–3 minutes, so you can follow a whole job from start to finish. When a driver turns on **Settings → Share my phone's GPS**, their phone's location is streamed instead, and the simulator leaves that truck alone. Dispatch can switch the simulator off in Settings.

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
