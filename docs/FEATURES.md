# Feature checklist and handoff

Source review: all 13 pages of `../Documentation.pdf` extracted, with the TrackShield page also visually inspected.

| Stage          | Status                                                   | Evidence / remaining work                                                                                                                                                             |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation     | Implemented; logic tested                                | Accounts, SQLite, sessions, health, responsive shell. Real HTTP/visual checks blocked by sandbox.                                                                                     |
| Contacts / SOS | Implemented; logic tested                                | CRUD, phone validation, ownership, Telegram invite/consent/`/stop`, real Telegram delivery with sent/failed status (fake Telegram API in tests), SMS composer fallback, Call 112. Real bot untested here. |
| RouteShield    | Implemented; algorithm tested                            | Real OSM tile viewer with GPS/map-picked points; live Overpass graph, shared Dijkstra, weights and explicit unknown tags. Live network retrieval untested here.                       |
| DeepCloak      | Simulation implemented; pixel logic tested               | Local processing, original/output preview and PNG download. No face model, PGD/EOT or efficacy measurements. Browser decoding/export untested here.                                   |
| TrackShield    | Native and supported-browser scan adapters implemented   | Bounded histories, trust list, tracker identification (Find My, DULT, Find Hub, SmartTag, Tile) with a stronger rule for separated trackers, calibrated estimate. Native BluetoothLe scan lifecycle tested using mocks; physical BLE and calibration untested.        |
| Audio Trigger  | Experimental foreground path and simulations implemented | RAM-only worklet, Chrome on-device recognizer (with pack install) or free offline Vosk fallback, cooldown, countdown integration. YAMNet scream detection with a sustained-score gate. Mic/speech/scream accuracy untested.                                       |
| PWA / native   | PWA build verified; native scaffold provided             | Manifest/icons/versioned shell emitted. Real offline/install flow and SDK builds untested. Capacitor wraps a hosted HTTPS app; BluetoothLe plugin installation/rebuild is documented. |

## Scope decisions

- Node built-ins replace FastAPI because Python dependency downloads are unavailable; SQLite keeps the first release simple.
- Photo and tracking data stay on the client; no unnecessary upload/sync endpoints.
- Random image perturbation is explicitly a simulation, not adversarial optimization. A licensed and evaluated face model is needed for the intended DeepCloak experiment.
- BLE persistence is an experimental rule (three distinct scans, two self-reported movement sessions), not a trained/calibrated detector. No directional location claims.
- Speech recognition is on-device only: Chrome's local recognizer when installed, otherwise Vosk (WASM, self-hosted model). No server or cloud recognizer is allowed. Scream detection uses the pretrained YAMNet "Screaming" class on-device; MediaPipe metrics are blocked by CSP.
- All contact verification and alert delivery are mock operations. Connecting a real provider must include verified recipients, consent, delivery callbacks, idempotency and failure handling.
- No background or locked-screen monitoring is claimed, including in the native wrapper.

## Device validation before real use

1. Run the supplied browser flow over HTTPS at desktop and phone sizes; review focus order, dialog cancellation, offline installation and error messages.
2. Check Android and iOS permissions independently, sensor interruption, app backgrounding and battery behavior.
3. Compare BLE behavior with normal accessories and test tags across multiple environments. Calibrate RSSI per device/environment; tune false/missed alerts.
4. Evaluate on-device voice detection with varied speakers and noise. Record real screams and everyday noise to calibrate the YAMNet threshold and gate.
5. Evaluate actual PGD/EOT protection against named, licensed face models with consented images, compression/resizing tests and image-quality measurements.
6. Test real messaging delivery in an explicitly configured non-production sandbox before enabling any live emergency workflow.
