# RESQ-X implementation plan

Source: ../Documentation.pdf, all 13 pages. Platform decision: mobile-first installable React PWA with Capacitor native packaging. This is a safety-support prototype.

## Stack and scope

React, TypeScript and Vite; plain CSS and Lucide icons. Node 22 built-in HTTP, SQLite, cookie sessions and PBKDF2 passwords. FastAPI packages cannot be downloaded in this environment; a zero-dependency Node backend keeps the app runnable. SQLite replaces PostgreSQL for a fast, single-server prototype. No paid services or model downloads are required. No existing callers, fixtures or exports exist.

Design: pale cool background #f3f6f7, ink #172e35, teal #11796e, mint #e2f3ed, emergency coral #dd514b, white #ffffff. System sans-serif for offline reliability. Desktop left navigation and two-column workspace become mobile bottom navigation and stacked content. A prominent safety check-in and explicit module activity are central, without implying protection is guaranteed.

## Commit stages

1. Foundation: app shell, authentication, persistent database, health endpoint, development scripts.
2. Contacts and SOS: validated contacts, simulated verification, ten-second cancellable SOS, authenticated idempotent mock delivery and alert history.
3. RouteShield: actual Dijkstra shortest and weighted routes, inspectable scores, fictional offline graph, bounded live OSM retrieval, explicit missing-data rules and failure handling.
4. DeepCloak: consented upload, validated image pipeline, orientation correction, stripped metadata, bounded pixel-perturbation simulation, preview/download and measured pixel metrics. No face model or adversarial efficacy claim.
5. TrackShield: opt-in browser BLE advertisement capability where available, repeat observations, local trust list, signal history and separate labeled simulation. No exact bearing or stalking inference.
6. Audio Trigger: explicit microphone permission, local in-memory analysis, optional strictly on-device speech recognition, stop controls, foreground interruption handling and simulated phrase/scream triggers; shared SOS countdown.
7. Hardening: PWA offline shell and install flow, Capacitor configuration, API and browser checks, privacy and setup documentation.

## Boundaries and risks

- SMS is always simulated: no real messages or emergency services are contacted. Contact verification is simulated and never presented as actual verification.
- Photos are processed in memory, never retained; random perturbation is a pipeline simulation, not PGD/EOT protection. No trained model is included.
- BLE cannot be universally scanned from mobile browsers; simulation remains available. RSSI does not measure bearing. Persistence thresholds are experimental.
- Microphone runs only while the app is visible. No raw audio is stored/uploaded. Browser remote speech recognition is never used. Scream detection is simulated, not inferred from volume.
- Live OSM routing has bounded coverage, public service availability and incomplete tags. Unknown lighting receives 0.5, not 0. No route is labeled safe.
- Credentials remain on the backend. Authenticated APIs use HttpOnly SameSite cookies, origin checks and per-user ownership. HTTPS is required outside localhost. SQLite is unencrypted at rest; use an encrypted host volume for deployment.
- Native wrapper configuration does not implement background BLE/audio; physical device and SDK builds are required separately.

## Verification

Run Python unittest tests for authentication, isolation, contact input, idempotent alert delivery, route scoring/disconnected paths, photo validation/perturbation bounds and retention. Run TypeScript and production builds, browser flows at desktop and mobile widths, cancellable countdown and confirmed simulation, persisted contacts, image download, tracking trust, audio permission denial and offline reload. Record actual outcomes in README; no real emergency messages in tests.

## Final outcome

All seven implementation stages completed as prototype code, with separate feature commits. Eighteen API/algorithm/startup/UI test groups and the production build pass. Routing and audio phrase logic are shared between runtime and tests. PWA packaging caches only public shell assets. `README.md` documents actual behavior and explicit simulations.

Execution-environment limits prevented real HTTP serving, Chromium launch, native SDK builds and external API/device checks; these remain unverified rather than marked passed. The native target is a hosted-PWA Capacitor wrapper, with background sensor support deferred. A repeatable browser flow is supplied for a normal local environment.

## Real routing and tracking follow-up

Live OSM mode is now the default online, with actual map tiles, GPS/manual/map-selected endpoints, Overpass-derived paths, fetch metadata and inspectable lighting/activity factors. Samples are explicit and are never returned after a live provider error. No tile downloads are automated in tests. The live-provider CLI was attempted but failed on external connectivity; that is not recorded as a pass.

Tracking defaults to real hardware and reports browser capabilities before scanning. A Capacitor BluetoothLe native adapter handles permissions, RSSI advertisements, scan cancellation and listener cleanup; supported browser scanning shares the same lifecycle. Native and browser paths were tested against mocked interfaces, not a phone. Optional samples remain clearly separate.

## Overpass retrieval follow-up

Street-data failures now expose sanitized provider status/network diagnostics instead of one generic message. Transient failures try one alternate real public instance; rate limits, invalid requests and excessive payloads do not. Total retrieval time is bounded below the client deadline. The live CLI was rerun and reports DNS EAI_AGAIN in this execution sandbox. The user's server failure still needs its own diagnostic output; live connectivity is not marked fixed or verified.

## Public-service queue timing correction

The user's diagnostic showed HTTP 502 from the first provider and timeout from the second. The original 12-second HTTP budget was shorter than Overpass's documented queue allowance. Shared constants now give each provider 45 seconds (25-second query, up to 15-second queue, transfer margin), with 100 seconds for browser routing requests. Other API calls retain 30 seconds. Street queries exclude unsupported highways and retrieve node references from the road set only. Tests enforce the cross-layer timing invariant; provider availability remains externally dependent.

## Section state retention

Replaced conditional screen unmounting with lazy, retained screens. User work persists within the current session across section changes, while explicit visibility effects stop audio and Bluetooth operations. Hidden maps retain viewport state without requesting tiles or accepting zero-sized hidden layout measurements. Sign-out still unmounts all sections and clears transient data/object URLs. A jsdom test exercises actual React navigation, route results, contact drafts, photo selection/output, scan history, audio settings, sensor stop and logout cleanup. Reload persistence is deliberately unchanged.
