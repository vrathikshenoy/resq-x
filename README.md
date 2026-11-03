# RESQ-X

A mobile-first personal safety and digital privacy prototype, implemented from the 13-page `../Documentation.pdf`. Install it as a PWA, or package the hosted app in an Android/iOS Capacitor wrapper.

**This is a demonstration, not an emergency service. All SMS and contact verification are simulated.**

## Run

Requires Node **22.13+** (Node 24 LTS recommended) and npm. No backend packages, API keys, paid services, Python environment, or model downloads are needed.

```sh
cd "/mnt/ssd/New Folder/resq-x"
npm install
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

| Feature          | Working behavior                                                                                                                                       | Simulation / limit                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Foundation       | Responsive app shell, registration/login/logout, private demo sessions, persistent SQLite, PBKDF2 passwords, expiring HttpOnly cookie sessions         | No email verification or password recovery; single-server prototype                                                                        |
| Trusted circle   | Add, edit, remove and validate up to 10 international-format contacts; changing a number resets verification                                           | Verification explicitly simulated; contact consent must be obtained separately                                                             |
| SOS              | Ten-second cancellable dialog, optional location requested afterward, idempotent server requests, per-contact results, account-scoped alert history    | Mock delivery only. No actual SMS, calls, push notifications or emergency dispatch                                                         |
| RouteShield      | Real Dijkstra shortest/weighted paths, map geometry, street-by-street factors, unknown-lighting handling, bounded live Overpass adapter                | Offline graph is fictional. Live OSM depends on network and incomplete tags; weights do not establish safety                               |
| DeepCloak        | Local image validation, orientation-aware browser decoding, preview, bounded ±8 channel changes, metadata-free PNG export, measured PSNR               | Random perturbation simulation; no face detection/model, PGD/EOT, embeddings or measured model protection                                  |
| TrackShield      | Opt-in real BLE advertisements where `requestLEScan` exists, per-session observations, signal history, local trust list, calibrated path-loss controls | Three-second demo scans always available. Repeated detection rule uses self-reported movement; no directional radar or stalking conclusion |
| Audio Trigger    | Explicit microphone permission, AudioWorklet volume meter, 1.5-second RAM buffer, optional strictly on-device English speech recognition               | No trained KWS/scream model. Phrase/scream simulations are available without a mic. No remote speech fallback                              |
| PWA              | Standalone manifest, maskable icons, versioned offline app shell, responsive safe-area navigation                                                      | Visit once online. Photos, route demos and BLE demos work offline; contacts and alerts require the server                                  |
| Native packaging | Capacitor config and Android/iOS setup instructions                                                                                                    | Wrapper scaffolding only; no native binary, BLE plugin or background sensor implementation                                                 |

## A five-minute walkthrough

1. Choose **Try the demo** and open **Set up my safety circle**.
2. Add a contact using an international number (for example `+15550102001`) and choose **Simulate verification**. No messages are sent.
3. Choose **Practice an SOS**, cancel once, then try again and let the countdown complete. Inspect the test alert history. Location is optional and permission denial does not block the mock alert.
4. Open **RouteShield** to compare sample paths. Select either option and inspect its scoring table. For live data, enter two coordinates within 3 km and choose **Live OSM data**. Failure is explicit; live mode never silently returns sample data.
5. Open **DeepCloak**, choose a file or sample illustration, confirm permission, and run the simulation. Compare and download the result. Metrics refer to pixel changes against the resized input, not face-model effectiveness.
6. Open **TrackShield** and run a sample scan three times. Mark movement before the second and third scans. Inspect the repeated-detection notice and a device’s signal history, then mark it trusted.
7. Open **Audio Trigger** and rehearse a phrase/scream trigger. A real microphone is optional. Local phrase recognition only starts if the browser explicitly reports an installed on-device English recognizer.

On mobile, Home shows all four tools. **More** opens Settings with direct links to every module and the trusted circle.

## Architecture

- React + TypeScript + Vite, plain CSS and Lucide icons.
- Node built-in HTTP, SQLite and crypto; zero backend dependencies.
- SQLite at `data/resq-x.sqlite`, created automatically. Back up the database with SQLite’s backup tooling; do not copy a live WAL database without its WAL state.
- Shared pure routing code in `shared/routing.mjs` powers both offline demos and backend calculations.
- Browser-only photo processing. Nothing about your photo reaches the server.
- Foreground audio analysis in `public/audio-worklet.js`. No raw audio crosses the worklet boundary or reaches the API.

The PDF suggests FastAPI/PostgreSQL. Node/SQLite was selected here because FastAPI could not be downloaded and a single-process local demonstration does not need a separate database service. The documented HTTP feature boundaries remain small and authenticated.

### API

All feature endpoints require the session cookie. JSON requests are limited to 1 MB and checked for object shape. Mutating browser requests are checked against the application origin. Queries are parameterized and data is scoped to the signed-in account.

| Method               | Endpoint                                 | Purpose                                                                                                |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| GET                  | `/health`                                | Process/database status; SMS mode                                                                      |
| POST                 | `/api/v1/auth/register`                  | `{name,email,password}`                                                                                |
| POST                 | `/api/v1/auth/login`                     | `{email,password}`                                                                                     |
| POST                 | `/api/v1/auth/demo`                      | Creates an isolated demo session                                                                       |
| GET / POST           | `/api/v1/auth/me`, `/api/v1/auth/logout` | Current account / end session                                                                          |
| GET / POST           | `/api/v1/contacts`                       | List / add `{name,phone,relation}`                                                                     |
| PUT / PATCH / DELETE | `/api/v1/contacts/:id`                   | Edit / `{verify_simulation:true}` / remove                                                             |
| POST                 | `/api/v1/alerts/trigger`                 | `{request_id,type,location}`; type is manual/phrase/scream; location is null or `{latitude,longitude}` |
| GET                  | `/api/v1/alerts`                         | Latest 50 alerts with explicitly simulated delivery results                                            |
| GET                  | `/api/v1/navigation/places`              | Fictional demo locations                                                                               |
| POST                 | `/api/v1/navigation/route`               | `{mode:"demo",origin:"0",destination:"15"}` or `{mode:"live",origin:[lat,lon],destination:[lat,lon]}`  |

Tracking observations and trusted-device identifiers stay in the browser. The optional tracking sync and photo-upload APIs from the PDF are deliberately omitted because no server transfer is needed for these implementations.

### Route calculation

`cost = length × [1 + 2.5 × (1 − lighting) + 1.5 × (1 − activity)]`

Lighting is `1` for a lit tag, `0` for explicitly unlit, and `0.5` for unknown. Activity counts selected amenity/shop nodes within 75 m of the segment midpoint, capped at three. This is a starting heuristic, not a validated safety score. Nearby amenities may be closed. Pedestrian restrictions, `oneway:foot`, disconnected streets and missing tags are handled. Access and other real-world walking restrictions may still be incomplete in OSM.

Live requests use a fixed Overpass endpoint, at most 3 km between endpoints, a bounded area, response/time/graph-size limits and a one-hour in-memory cache of up to ten public street graphs. Endpoint connectors are not turn-by-turn directions. The UI draws returned street geometry rather than requiring external map tiles; OSM attribution is displayed.

## Privacy and deployment

- Permissions are requested only for the enabled operation. Hiding/leaving the page stops microphone/BLE activity and cancels a pending SOS countdown.
- No raw audio, photo, route history or GPS track is stored. Alert coordinates are retained only when you explicitly include them.
- Scan history is limited to 25 devices / 30 readings each and discarded when the screen closes. Trusted-device IDs persist locally per account. Browser site-data controls can clear them.
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
npm install @capacitor/core @capacitor/android @capacitor/ios
npm install -D @capacitor/cli
export RESQX_NATIVE_URL=https://your-deployed-resqx.example
npm run build
npx --no-install cap add android
# On macOS, optionally: npx --no-install cap add ios
npm run native:sync
npm run native:android
# On macOS: npm run native:ios
```

Build/sign using the platform SDK. Use the simulation controls in WebViews where BLE or speech APIs are absent. Real background BLE, location, keyword spotting, local haptics and reliable locked-screen operation require native plugins, operating-system permissions and physical-device testing. Capacitor packaging and device binaries could not be built in this environment.

## Validation

```sh
npm test
npm run build
# In another terminal, with npm start already running:
npx playwright install chromium
npm run test:e2e
```

**Verified here:** eleven test groups pass, covering authentication, origin/content-type/object validation, account isolation, contact edits/verification/duplicates, alert idempotency and location input, route scoring/disconnection/access, photo perturbation bounds and file signatures, tracking persistence/trust/bounded history, audio buffer/phrase matching, and actual backend entry-point initialization, occupied-port error handling and dynamic development proxy wiring and preserved browser-host origin validation (with socket binding stubbed). TypeScript checking and the Vite production build pass. PWA build emits a versioned offline cache.

**Not verified here:** real HTTP/browser end-to-end operation, visual layout, service-worker offline reload, microphone/BLE/GPS hardware, live Overpass requests, clean dependency installation and Android/iOS builds. The execution sandbox rejects local listening sockets and Chromium launch. The connected-browser check also timed out. `tests/browser.mjs` supplies a repeatable end-to-end flow including contacts, countdown cancel/confirmation, image download, route/tracker/audio demos, mobile overflow and offline routing; it was not successfully run here.

## Staged history

`git log --oneline` shows separate commits for the plan, foundation, contacts/SOS, routing, photos, tracking, audio and integration. See [the implementation plan](docs/IMPLEMENTATION.md) and [feature checklist](docs/FEATURES.md) for scope and status.
