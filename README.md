# RESQ-X

A mobile-first personal safety and digital privacy prototype, implemented from the 13-page `../Documentation.pdf`. Install it as a PWA, or package the hosted app in an Android/iOS Capacitor wrapper.

**This is a prototype, not an emergency service.** Real SOS alerts go only to contacts who joined through Telegram. Contacts verified with **Simulate verification** receive nothing. In an emergency, call 112.

## Run

Requires Node **22.13+** (Node 24 LTS recommended) and npm. No backend packages, API keys, paid services or Python environment are needed. The offline voice model is an optional, free one-time download.

```sh
cd "/mnt/ssd/New Folder/resq-x"
npm install
npm run voice:model   # optional: free on-device audio models (Vosk ~41 MB, YAMNet ~4 MB) into public/models/
npm run dev
```

Open **http://localhost:5173**. Choose **Try the demo**, or create an account with a password of at least 10 characters. The dev script starts Vite and the API together; the API uses an automatically selected free loopback port, which is passed to Vite’s proxy. The launcher logs its address and watches backend files for changes. Production `npm start` still defaults to port 3001.

For the installable production build:

```sh
npm run build
npm start
```

Open **http://localhost:3001**. Install using the browser menu, or Settings → install instructions. The service worker is enabled in the production build, not Vite development mode. On iPhone, use Safari → Share → Add to Home Screen.

Dependencies already present on this machine were reused for the build because package downloads are blocked in the execution environment. A clean `npm install` could not be verified here. The package manifest pins the versions used; local `node_modules` is excluded from Git.

## Implemented features

| Feature          | Working behavior                                                                                                                                    | Simulation / limit                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Foundation       | Responsive app shell, registration/login/logout, private demo sessions, persistent SQLite, PBKDF2 passwords, expiring HttpOnly cookie sessions      | No email verification or password recovery; single-server prototype                                                                        |
| Trusted circle   | Add, edit, remove and validate up to 10 international-format contacts. Real verification: the contact opens a Telegram invite and taps Start (consent) | Demo **Simulate verification** remains and sends nothing. Changing a number resets verification and the Telegram link                       |
| SOS              | Ten-second cancellable dialog, optional location, real Telegram messages with per-contact sent/failed status, pre-filled SMS fallback, Call 112       | Free Telegram bot needs `TELEGRAM_BOT_TOKEN`. SMS is sent by the user from their phone. No emergency dispatch integration                   |
| RouteShield      | Live OSM tiles, GPS/map-picked endpoints, Overpass street graphs, Dijkstra shortest/weighted paths, inspectable street tags and fetch timestamp     | Offline graph is fictional. Live OSM depends on network and incomplete tags; weights do not establish safety                               |
| DeepCloak        | Local image validation, orientation-aware browser decoding, preview, bounded ±8 channel changes, metadata-free PNG export, measured PSNR            | Random perturbation simulation; no face detection/model, PGD/EOT, embeddings or measured model protection                                  |
| TrackShield      | Native BluetoothLe and supported-browser advertisement scans, signal history, trust list, RSSI calibration, identification of AirTag/Find My, Google Find Hub, SmartTag, Tile and standard (DULT) trackers | Foreground only. Sample mode is optional and labelled. No directional radar; an identified tracker is not proof of stalking |
| Audio Trigger    | Explicit microphone permission, AudioWorklet meter, wake phrase (Chrome on-device or free offline Vosk), scream detection (free on-device YAMNet)    | Phrase and scream thresholds uncalibrated. Simulations work without a mic. No audio ever leaves the device                                   |
| PWA              | Standalone manifest, maskable icons, versioned offline app shell, responsive safe-area navigation                                                   | Visit once online. Photos, route demos and BLE demos work offline; contacts and alerts require the server                                  |
| Native packaging | Capacitor config and Android/iOS setup instructions                                                                                                 | Native BLE adapter requires installing the documented plugin and rebuilding; no native binary or background sensor implementation          |

## A five-minute walkthrough

1. Choose **Try the demo** and open **Set up my safety circle**.
2. Add a contact using an international number (for example `+15550102001`). Choose **Invite on Telegram** for real alerts (see [SOS alerts](#sos-alerts-how-they-work)), or **Simulate verification** for a demo that sends nothing.
3. Choose **Start an SOS**, cancel once, then try again and let the countdown complete. The dialog says up front whether the alert is real (Telegram contacts) or practice. Afterwards, inspect each contact's delivery status in the alert history. Location is optional, and denying permission does not block the alert.
4. Open **RouteShield**. **Live OSM data** is the default online. Use **Use my location** or **Set start on map**, then **Set destination on map** (or enter coordinates). Choose **Compare walking routes** for locations within 3 km. Inspect shortest/weighted alternatives, lighting tags and the real-data timestamp. **Offline demo** is an explicit sample mode; live failure never returns fabricated data.
5. Open **DeepCloak**, choose a file or sample illustration, confirm permission, and run the simulation. Compare and download the result. Metrics refer to pixel changes against the resized input, not face-model effectiveness.
6. Open **TrackShield**. Real scanning is the default. A native build with the BluetoothLe plugin, or a browser exposing BLE advertisement scanning, requests permission when you press **Start foreground scan**. Unsupported browsers show the limitation and no devices. To rehearse without hardware, select **Optional sample** explicitly. Its "Unfamiliar sample tag" acts as a separated Find My tracker, so two scans with movement marked once raise a warning. See [TrackShield: tracker identification](#trackshield-tracker-identification).
7. Open **Audio Trigger** and rehearse a phrase/scream trigger. A real microphone is optional. To try the real detectors, choose **Enable foreground microphone**, then **Enable local phrase recognition** and/or **Enable scream detection**. See [Audio Trigger: how it works](#audio-trigger-how-it-works).

On mobile, Home shows all four tools. **More** opens Settings with direct links to every module and the trusted circle.

## Architecture

- React + TypeScript + Vite, plain CSS and Lucide icons.
- Node built-in HTTP, SQLite and crypto; zero backend dependencies.
- SQLite at `data/resq-x.sqlite`, created automatically. Back up the database with SQLite’s backup tooling; do not copy a live WAL database without its WAL state.
- Shared pure routing code in `shared/routing.mjs` powers both offline demos and backend calculations.
- Browser-only photo processing. Nothing about your photo reaches the server.
- Foreground audio analysis in `src/lib/audio-worklet.js` (bundled by Vite with `src/lib/audio-core.mjs`). Raw audio leaves the worklet only for the in-page offline recognizer, and never reaches the API.

The PDF suggests FastAPI/PostgreSQL. Node/SQLite was selected here because FastAPI could not be downloaded and a single-process local demonstration does not need a separate database service. The documented HTTP feature boundaries remain small and authenticated.

### API

All feature endpoints require the session cookie. JSON requests are limited to 1 MB and checked for object shape. Mutating browser requests are checked against the application origin. Queries are parameterized and data is scoped to the signed-in account.

| Method               | Endpoint                                 | Purpose                                                                                                |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| GET                  | `/health`                                | Process/database status; `alerts` is `telegram` or `simulation`                                        |
| POST                 | `/api/v1/auth/register`                  | `{name,email,password}`                                                                                |
| POST                 | `/api/v1/auth/login`                     | `{email,password}`                                                                                     |
| POST                 | `/api/v1/auth/demo`                      | Creates an isolated demo session                                                                       |
| GET / POST           | `/api/v1/auth/me`, `/api/v1/auth/logout` | Current account / end session                                                                          |
| GET / POST           | `/api/v1/contacts`                       | List / add `{name,phone,relation}`                                                                     |
| PUT / PATCH / DELETE | `/api/v1/contacts/:id`                   | Edit / `{verify_simulation:true}` / remove                                                             |
| POST                 | `/api/v1/contacts/:id/telegram`          | `{}` → `{link}`: one-time Telegram invite (7 days); 503 when no bot token is configured                |
| POST                 | `/api/v1/alerts/trigger`                 | `{request_id,type,location}`; type is manual/phrase/scream; location is null or `{latitude,longitude}` |
| GET                  | `/api/v1/alerts`                         | Latest 50 alerts; each recipient has `channel` (telegram/simulation) and `status` (sent/failed/simulated) |
| GET                  | `/api/v1/navigation/places`              | Fictional demo locations                                                                               |
| POST                 | `/api/v1/navigation/route`               | `{mode:"demo",origin:"0",destination:"15"}` or `{mode:"live",origin:[lat,lon],destination:[lat,lon]}`  |

Tracking observations and trusted-device identifiers stay in the browser. The optional tracking sync and photo-upload APIs from the PDF are deliberately omitted because no server transfer is needed for these implementations.

### Route calculation

`cost = length × [1 + 2.5 × (1 − lighting) + 1.5 × (1 − activity)]`

Lighting is `1` for a lit tag, `0` for explicitly unlit, and `0.5` for unknown. Activity counts selected amenity/shop nodes within 75 m of the segment midpoint, capped at three. This is a starting heuristic, not a validated safety score. Nearby amenities may be closed. Pedestrian restrictions, `oneway:foot`, disconnected streets and missing tags are handled. Access and other real-world walking restrictions may still be incomplete in OSM.

Live requests use a primary Overpass endpoint and one bounded failover endpoint for transient failures, at most 3 km between endpoints, a bounded area, response/time/graph-size limits and a one-hour in-memory cache of up to ten public street graphs. Endpoint connectors are not turn-by-turn directions. The live map loads real OpenStreetMap raster tiles and overlays returned route geometry in Web Mercator. It supports pan, zoom, GPS and selecting start/destination points. Tiles follow normal browser caching; there is no offline tile download or prefetch. Failed tiles are reported while route geometry remains visible. OSM attribution links to its copyright page.

### TrackShield: tracker identification

Each Bluetooth advertisement is checked for the broadcast formats that item trackers use (`identifyTracker` in `src/lib/ble.mjs`):

| Tracker | Signal in the advertisement | "Away from owner" |
|---|---|---|
| Apple Find My (AirTag, Chipolo Spot, other Find My items) | Manufacturer data, company `0x004C`, type `0x12` | Length byte `0x19` (separated) vs `0x02` (near owner) |
| Unwanted-tracking standard (DULT, Apple/Google) | Service UUID `0xFCB2` | Always (sent only while separated) |
| Google Find Hub | Service data `0xFEAA`, frame `0x40`/`0x41` | Frame `0x41` |
| Samsung SmartTag | Service data `0xFD5A` | Not reported |
| Tile | Service UUID `0xFEED`/`0xFEEC` | Not reported |

Identified trackers are listed first and labelled. A tracker that says it is away from its owner raises the "repeated detection" warning after **2 scan sessions with 1 movement**, instead of 3 sessions with 2 movements. A separated AirTag keeps its address for hours, while near its owner it rotates about every 15 minutes, so repeated sightings of a separated tracker are meaningful.

**Limits.** Scanning works only while TrackShield is open. Browsers may hide some advertisement data. Address rotation can split one tracker into several entries. An identified tracker near you may belong to someone travelling with you, so the app shows evidence, not conclusions. Your phone's built-in unwanted-tracking alerts (iOS, and Android's "Unknown tracker alerts") remain the most reliable check.

### SOS alerts: how they work

Every path below is free.

**1. Set up the Telegram bot (once, about 2 minutes).**

1. In Telegram, message **@BotFather**, send `/newbot`, and choose a name and a username ending in `bot`.
2. Put the token in `.env` or `.env.local` (both git-ignored) as `TELEGRAM_BOT_TOKEN=...`. Keep it secret.
3. Restart `npm start` or `npm run dev`. Both read `.env` and `.env.local`, and log `Telegram alerts enabled`. Run only one of them at a time per bot token.

The server long-polls Telegram's `getUpdates`, so it needs no public URL, webhook or HTTPS. It works on localhost.

**2. Invite each contact.** In **Trusted circle**, choose **Invite on Telegram** and share the link (WhatsApp, SMS, anything). When your contact opens it and taps **Start**, the bot links their Telegram chat to that contact, marks them verified and confirms with a message. Tapping Start is their consent. They can send `/stop` at any time to leave every circle. Links work once and expire after 7 days. Changing the contact's phone number unlinks them.

**3. On SOS**, after the 10-second countdown:

- **Telegram:** each linked contact gets a message with your name, the trigger (button, phrase or scream) and an OpenStreetMap link if you shared your location. Each recipient is recorded as `sent` or `failed`, with the reason. A retry with the same alert ID never sends twice.
- **SMS fallback:** **Also text them by SMS** opens your phone's messaging app with every contact and the message (plus location) filled in. You tap Send, and it uses your own SMS plan. This works with no server and no internet data.
- **Call 112:** shown during the countdown and afterwards. During the countdown it sends the alert immediately and then opens the dialer, because leaving the app would otherwise cancel the countdown. 112 is India's and Europe's emergency number, and most mobile phones also route it to the local emergency service.

Contacts verified with **Simulate verification** never receive anything. The dialog and alert history label them "simulated, nothing sent".

**Limits.** Contacts need Telegram. The server must be running to send, but the SMS and 112 buttons work without it. Telegram limits bots to roughly 30 messages per second, far above 10 contacts. Automatic SMS without the user tapping Send would need a paid provider (Twilio, MSG91 with Indian DLT registration).

### Audio Trigger: how it works

Everything runs on your device, while the Audio Trigger screen is open. No paid or cloud speech service is used.

```
microphone ─▶ AudioWorklet (src/lib/audio-worklet.js)   [chunks also feed YAMNet scream detection]
                ├─ volume level, 10×/s ─────────────▶ meter bars (display only)
                ├─ 1.5 s circular buffer in RAM (overwritten, never stored)
                └─ 4096-sample chunks, only after offline phrase recognition is enabled
                                                    ─▶ Vosk Web Worker ─▶ text + per-word confidence
Chrome on-device recognizer (if installed) ─────────▶ text + confidence
                                                      │
                     matchesPhrase(): whole phrase, confidence ≥ 0.75
                                                      ▼
                     10-second cancellable SOS countdown ─▶ Telegram alert (or simulation)
```

1. **Enable foreground microphone** asks for microphone permission and starts the volume meter. Volume alone never triggers an SOS.
2. **Enable local phrase recognition** chooses an engine in this order:
   - **Chrome's on-device recognizer.** It is used when the browser reports that its English pack is installed. If Chrome reports that the pack can be downloaded, the app asks Chrome to install it first. Chrome's cloud recognizer is never used.
   - **Vosk (fallback).** This is a free, open-source (Apache-2.0) speech recognizer compiled to WebAssembly (the `vosk-browser` package). It runs in a Web Worker in every modern browser, including Safari. The ~41 MB English model is served from this app's own origin (`/models/…`). The first use downloads it once. Vosk then keeps it in IndexedDB, so later starts are fast and work offline. The recognizer only listens for your phrase (a grammar of `[phrase, "[unk]"]`), and **every word** must score at least 0.75 confidence.
3. When the whole phrase matches, the shared SOS countdown starts. A 30-second cooldown prevents repeated triggers. Leaving the screen, hiding the app or triggering an SOS stops the microphone and terminates the Vosk worker.

**Choosing a phrase.** Use common English words. Brand spellings are normalized, so "ResQ" is matched as "rescue" (the default phrase "Hey ResQ help" is recognized as "hey rescue help"). Vosk cannot recognize words outside its vocabulary, so a phrase containing made-up words will never match.

**Setting up the offline model.**

```sh
npm run voice:model   # downloads Vosk and YAMNet into public/models/ (git-ignored)
npm run build         # copies it into dist/models/
```

If the model file is missing, the app says so and keeps working with the simulations. To host the model elsewhere, set `VITE_VOSK_MODEL_URL` at build time. That host must send CORS headers, and you must add it to the server's `connect-src` CSP.

**Security trade-off.** The Vosk worker is Emscripten code that calls `new Function`. The page Content-Security-Policy therefore includes `script-src 'self' 'unsafe-eval'` and `worker-src 'self' blob:`. Scripts are still limited to this origin. To remove `'unsafe-eval'`, serve the Vosk worker from its own URL with a separate policy.

**Scream detection.** **Enable scream detection** loads Google's free YAMNet sound classifier (Apache-2.0) through MediaPipe Audio Tasks. The model is a ~4 MB file at `/models/yamnet.tflite`, downloaded by `npm run voice:model`. The WASM runtime is bundled by Vite as same-origin assets, so no CDN is used. Twice a second, the last 1 second of audio (`AudioWindow.snapshot()`) is classified, and only the "Screaming" score is read. `ScreamGate` starts the SOS countdown only when that score is at least 0.5 in 2 of the last 3 checks, about one second of sustained screaming. A single loud bang or shout does not trigger it. The thresholds are uncalibrated starting values: shouting, singing or TV audio may trigger it, and the countdown lets you cancel.

**MediaPipe metrics.** MediaPipe tries to send usage metrics (not audio) to `odml.pa.googleapis.com` every 60 seconds. The production CSP `connect-src 'self'` blocks this, and the Vite dev server sends the same header. A 70-second headless run recorded zero external requests, with the blocked attempt visible in the console.

**Limits.** Accuracy has not been measured across speakers, accents or noise. Random noise can make the grammar output a single phrase word (for example, "hey"), which is why the full phrase and per-word confidence are required. Foreground only: locked-screen or background listening needs a native plugin.

## Privacy and deployment

- Permissions are requested only for the enabled operation. Hiding/leaving the page stops microphone/BLE activity and cancels a pending SOS countdown.
- No raw audio, photo, route history or GPS track is stored. Speech recognition runs on the device; only the downloaded Vosk model (not audio) is kept in IndexedDB. Alert coordinates are retained only when you explicitly include them.
- Scan history is limited to 25 devices / 30 readings each and retained in memory across section changes. It is discarded on explicit clearing, sign-out or page reload. Trusted-device IDs persist locally per account. Browser site-data controls can clear them.
- Contacts and alert records persist on the server. Sign-out invalidates the current session; it does not delete your account data.
- The service worker caches only the public app shell, never API responses or private account data.
- Photo files are limited to JPEG/PNG/WebP, 10 MB and 24 megapixels; output is at most 1600 px on the longest side, with transparency composited on white before pixel changes. Original files are never overwritten.
- SQLite is not encrypted at rest. For deployment, use a private encrypted host volume with appropriate access permissions and backups.
- Use HTTPS outside localhost. TLS is required for installability, microphone, geolocation and BLE APIs. A plain HTTP LAN address does not provide those browser capabilities.
- Copy `.env.example` to `.env` for production settings. Set `APP_ORIGIN` to the exact public origin (no trailing slash) and `COOKIE_SECURE=true` behind HTTPS. `npm start` reads `.env` automatically. Keep port 3001 private behind a reverse proxy, or explicitly set `HOST` as needed.
- Authentication has basic login-attempt throttling. Before a public release, add operational abuse limits, account recovery/verification, retention/deletion policy, monitoring, backups and a security review.

### Android / iOS wrapper

The native target is a **Capacitor wrapper of the hosted HTTPS application**. The configuration rejects missing or insecure URLs. It does not grant background sensing or make unavailable Web APIs work. The bundled `dist` folder provides the web build; the wrapper opens the configured deployed application to keep API requests and sessions on the same HTTPS origin.

On a development machine with network access and Android Studio (or Xcode on macOS):

```sh
npm install @capacitor/core @capacitor/android @capacitor/ios @capacitor-community/bluetooth-le
npm install -D @capacitor/cli
export RESQX_NATIVE_URL=https://your-deployed-resqx.example
npm run build
npx --no-install cap add android
# On macOS, optionally: npx --no-install cap add ios
npm run native:sync
npm run native:android
# On macOS: npm run native:ios
```

Before running on **iOS**, add this required Bluetooth permission to `ios/App/App/Info.plist` inside `<dict>`:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>RESQ-X scans nearby Bluetooth devices only when you enable TrackShield.</string>
```

The native scan adapter uses the Capacitor-injected BluetoothLe plugin interface: permission initialization, Bluetooth-enabled check, repeated advertisements with RSSI, listener removal and stop on cancellation/page hiding. Android uses the plugin's standard Bluetooth/location permissions; do not assert `neverForLocation` because TrackShield estimates proximity. Match the BLE plugin major version to the Capacitor major version, as documented by the [plugin maintainers](https://github.com/capacitor-community/bluetooth-le).

Build/sign using the platform SDK and test on a physical phone. Simply installing the PWA does not add native Bluetooth support. Native scanning is foreground-only. Use the separate sample mode when hardware support is absent. Real background BLE, location, keyword spotting, local haptics and reliable locked-screen operation require native plugins, operating-system permissions and physical-device testing. Capacitor packaging and device binaries could not be built in this environment.

## Validation

```sh
npm test
npm run build
# In another terminal, with npm start already running:
npx playwright install chromium
npm run test:e2e
```

**Verified here:** eighteen test groups pass, covering authentication, origin/content-type/object validation, account isolation, contact edits/verification/duplicates, alert idempotency and location input, route scoring/disconnection/access, photo perturbation bounds and file signatures, tracking persistence/trust/bounded history, audio buffer/phrase matching, and actual backend entry-point initialization, occupied-port error handling and dynamic development proxy wiring and preserved browser-host origin validation, live-OSM response normalization/cache/failure behavior, map projection, native/browser BLE lifecycle, and real React DOM navigation state retention with sensor shutdown and logout cleanup (with external responses, image/audio APIs, hardware and socket binding stubbed). TypeScript checking and the Vite production build pass. PWA build emits a versioned offline cache.

**Offline voice check (2026-11-04):** with `npm start`, headless Chromium loaded the Vosk model from `/models/` under the production CSP in under a second. It created a phrase-grammar recognizer and accepted audio chunks. A missing model file was detected (served as `text/html`). No real speech was tested: no microphone or speech synthesizer was available, so recognition accuracy is unmeasured.

**Not verified here:** real HTTP/browser end-to-end operation, visual layout, service-worker offline reload, microphone/BLE/GPS hardware, live Overpass requests, clean dependency installation and Android/iOS builds. The execution sandbox rejects local listening sockets and Chromium launch. The connected-browser check also timed out. `tests/browser.mjs` supplies a repeatable end-to-end flow including contacts, countdown cancel/confirmation, image download, route/tracker/audio demos, mobile overflow and offline routing; it was not successfully run here.

## Staged history

`git log --oneline` shows separate commits for the plan, foundation, contacts/SOS, routing, photos, tracking, audio and integration. See [the implementation plan](docs/IMPLEMENTATION.md) and [feature checklist](docs/FEATURES.md) for scope and status.

## Live data and hardware checks

```sh
npm run test:live
# Or supply your actual origin and destination coordinates:
npm run test:live -- 12.975 77.59 12.9705 77.5948
```

This command calls the real Overpass provider, never mocks or substitutes sample data, and prints provider timestamp, graph size, route distances and lighting coverage. It **failed in this execution environment** because the provider could not be reached; a successful live provider check is not claimed. The separate automated API test uses a clearly constructed OSM-shaped fixture to verify parsing, tags, scoring, access exclusions, caching and errors. Browser tests block community tile downloads and explicitly select sample modes; they are not live-provider or BLE-hardware tests.

The tile viewer follows the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/): visible attribution, correct HTTPS tile URL, browser Referer, normal HTTP caching and viewport-only requests. No Nominatim geocoder is used. Before a larger deployment, choose a tile provider appropriate for its traffic.

### When tiles load but routing fails

Tiles are requested by the browser; street graphs are requested by the Node backend. They have separate network paths and services. Run `npm run test:live` on the machine running the server to see the actual cause. The sandbox run reported DNS `EAI_AGAIN` for both providers, not a successful live route.

Street retrieval now tries `overpass-api.de` and, for connection/server failures, `overpass.private.coffee` (listed among [OSM public Overpass instances](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances)). Each attempt has a 45-second HTTP deadline and a 25-second query budget, allowing the documented public-service queue delay plus transfer time. Both attempts fit within the route-specific 100-second browser deadline; other API calls keep their 30-second limit. The query requests relevant highway types and recursively fetches road nodes only. HTTP 429 stops immediately, so failover is not used to evade rate limits. Invalid client requests and excessive data sizes also stop rather than repeat. Errors identify HTTP status, DNS/connection code, timeout, invalid response or excessive area. Successful results retain the actual provider endpoint in their source metadata.

To use a dedicated service, set `OVERPASS_URL` to its HTTPS interpreter URL in the server environment, for example `OVERPASS_URL=https://your-overpass.example/api/interpreter npm run dev`. This overrides public failover. Setting it in `.env` applies to `npm start`, which loads that file; development can use the shell environment. No API keys or GPS coordinates are printed in the failure message.

### State while switching sections

Visited sections remain mounted, so route inputs/results/map view, selected/processed photos, Bluetooth observations/calibration, audio phrase/cooldown and unsaved contact forms remain available when navigating away and back. Unvisited sections do not mount or request their data until opened. Microphone capture and Bluetooth scanning stop on leaving their section; restart them explicitly on return. Hidden route maps do not download tiles. Signing out unmounts every retained section and revokes photo object URLs. Reloading the page clears transient in-memory work; account records and the local trusted-device list keep their existing persistence.

`npm run test:ui` runs the React DOM navigation regression in jsdom without local server sockets or a browser process. It checks tab return state, photo URL lifetime, microphone stop and sign-out cleanup. DOM APIs for image decoding/canvas/audio are mocked; this is not a physical-device or visual browser test.
