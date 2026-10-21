# PaceLab V6.4 — Phase 3 Status Report

**Date:** 21 October 2026  
**Phase:** Phase 3 — GPS Reliability  
**Result:** Implementation and emulator acceptance completed; physical-device
acceptance remains blocked by unavailable Android and iOS test devices.

This report separates verified software behavior from field tests that cannot be
claimed on an emulator. It does not authorize Phase 4, deployment, publishing,
provider configuration, or paid services.

## Objectives

- Isolate Expo location and background-task APIs behind a mobile adapter.
- Provide explicit foreground/background permission UX.
- Persist raw and validated GPS samples locally without a network dependency.
- Filter inaccurate, stale, jittering, and implausible samples.
- Calculate smoothed current pace, cumulative distance, and interpolated
  kilometer laps.
- Integrate GPS metrics into Free Run and Speedwork.
- Validate Android locked-screen/background behavior as far as the available
  emulator allows, and preserve a real-device field-test matrix.

## Completed steps

### 1. Shared GPS domain

- Added platform-independent GPS sample, tracker, point-quality, and kilometer
  lap models.
- Added haversine distance calculation and deterministic sample ingestion.
- Rejects malformed coordinates, horizontal accuracy worse than 50 m,
  out-of-order timestamps, accuracy-sized jitter, and speeds over 12 m/s.
- A gap longer than 30 seconds creates a new anchor without drawing a false
  straight-line segment across the missing period.
- Current pace uses a rolling 30-second window and remains unavailable until at
  least 5 seconds and 15 m of accepted movement exist.
- Kilometer boundaries are interpolated between accepted samples.

### 2. Offline GPS persistence

- Upgraded the SQLite schema to version 3.
- Added persisted GPS points with source, quality, coordinates, accuracy,
  altitude, and cumulative distance.
- Added persisted kilometer laps, location-task ownership, serialized tracker
  state, and Speedwork step results.
- GPS ingestion and session-distance updates execute locally in a transaction;
  the active run has no network dependency.

### 3. Native location adapter and permissions

- Added foreground tracking with navigation-grade accuracy and interval/distance
  hints.
- Added a globally registered Expo Task Manager background task, imported from
  the root layout as required by Expo Router.
- Added Android foreground-service notification configuration and iOS background
  location configuration through Expo config plugins.
- Background permission is requested only after a clear in-app explanation.
- A denied permission or disabled Location Services degrades to timer-only mode
  instead of aborting the run.

### 4. Free Run and Speedwork integration

- Free Run shows validated distance, smoothed pace, GPS health, and background
  readiness.
- Free Run produces persisted automatic kilometer laps and announces completed
  laps.
- Speedwork records total distance plus actual distance, pace, duration, and
  completion state per workout step.
- Pause, resume, finish, early finish, and unmount stop/restart tracking without
  inventing distance.
- Finalization reloads the last persisted tracker state before saving the final
  session distance, preventing a delayed UI poll from losing the latest sample.

## Created or materially modified files

- `packages/domain/src/gps.ts`
- `packages/domain/src/index.ts`
- `packages/domain/test/gps.test.ts`
- `apps/mobile/src/lib/location-service.ts`
- `apps/mobile/src/lib/location-task.ts`
- `apps/mobile/src/lib/database.ts`
- `apps/mobile/src/lib/audio-cues.ts`
- `apps/mobile/src/lib/format.ts`
- `apps/mobile/src/app/_layout.tsx`
- `apps/mobile/src/app/free-run.tsx`
- `apps/mobile/src/app/interval-run.tsx`
- `apps/mobile/app.json`
- `apps/mobile/package.json`
- `package-lock.json`
- `docs/07_PHASE_3_STATUS_REPORT.md`

The generated Android project was refreshed from Expo configuration. Its local
SDK pointer remains machine-local and is not a product source-of-truth file.

## Validation and acceptance results

| Validation | Actual result |
|---|---|
| GPS/domain tests | Passed: 5 GPS tests; complete domain suite is 5 files, 40 tests. |
| GPS rejection coverage | Passed for invalid, low-accuracy, out-of-order, jitter, and implausible-jump samples. |
| Gap handling | Passed: a gap over 30 seconds does not add bridged distance. |
| Pace smoothing | Passed with the minimum time/distance gate. |
| Kilometer laps | Passed: a 5,050 m trace yields five laps and a 50 m partial. |
| TypeScript | `npm run typecheck` passed. |
| Lint | `npm run lint` passed with zero reported errors or warnings. |
| Expo diagnostics | Passed 20/20 before final verification; the final retry was blocked by DNS access to npm, not a project diagnostic failure. |
| Expo native configuration | Verified background location, foreground-service, and task-manager modules in the generated Android build. |
| Android native build | Passed: x86_64 debug APK, 463 actionable tasks (67 executed, 396 up-to-date). |
| Android foreground GPS | Passed on API 36 emulator with injected coordinates. |
| Distance and pace UI | Passed on emulator: displayed 0.12 km and 2:31/km after the injected route. |
| Locked-screen emulator smoke | Passed: distance increased from 0.12 km to 0.24 km while the virtual screen was off. |
| Foreground location service | Confirmed running with the Android location service type and persistent notification during the smoke test. |
| Physical Android field tests | **Not run — no physical Android device is available.** |
| iOS native/device tests | **Not run — no macOS/Xcode/iPhone path is available.** |

## Real-device field-test matrix

These tests remain required before GPS reliability can receive unconditional
physical-device acceptance.

| Scenario | Android physical device | iPhone physical device | Acceptance evidence |
|---|---|---|---|
| Foreground road/track reference route | Not run | Not run | Compare distance and splits to a measured reference. |
| Screen locked for at least 20 minutes | Not run | Not run | Continuous timestamps, no false bridge, correct total distance. |
| One-hour run | Not run | Not run | No timer drift/crash; reasonable distance and battery use. |
| GPS interrupted and restored | Not run | Not run | Gap anchor; no straight-line distance spike. |
| Incoming call/interruption | Not run | Not run | Session survives and resumes without duplicate samples. |
| Bluetooth headset/audio | Not run | Not run | Cues are audible and do not stop GPS persistence. |
| Default and restricted battery modes | Not run | Not run | Document OEM behavior and required user guidance. |
| Permission denied/revoked mid-session | Not run | Not run | Timer continues; clear degraded state; no crash. |
| Process termination/force stop | Not run | Not run | Document OS limitation and recovery behavior. |

## Platform compatibility status

### Android

Native compilation, installation, foreground tracking, foreground-service
registration, injected route handling, and a locked-screen emulator smoke test
passed on an API 36 x86_64 AVD. This is useful integration evidence, but it is
not evidence of real satellite accuracy, OEM power-management reliability,
physical audio/Bluetooth behavior, or a one-hour field run.

### iOS

Shared TypeScript/domain behavior is covered and the Expo configuration contains
the iOS background-location declaration. No Xcode compilation, signed build,
simulator run, or iPhone field test was possible on Windows. iOS native GPS and
background behavior remain **not validated**.

## Known limitations, blockers, and risks

- Phase 3 cannot meet its literal “actual device field testing” criterion until
  a physical Android device is available. Emulator locked-screen success must
  not be treated as equivalent.
- iOS background execution, permission wording, power behavior, and location
  indicator require a signed iPhone build and physical test.
- Android OEMs can apply battery restrictions beyond standard Android behavior;
  field results and user guidance may need device-specific additions.
- Background location is sensitive personal data. It currently remains local;
  any Phase 4 synchronization must apply least-privilege access, retention, and
  deletion rules before upload is enabled.
- Android force-stop prevents applications from continuing background tasks by
  OS design; this needs user-facing documentation rather than a bypass.
- npm audit continues to report 27 dependency findings (8 moderate, 19 high).
  No broad dependency upgrade was performed because that would exceed Phase 3
  scope and could break Expo SDK compatibility.

## Proposed next phase

**Phase 4 — Account & Sync**

Proposed scope: Google authentication, optional Facebook authentication only
after provider setup, Supabase migrations and row-level security, durable
offline-first synchronization, conflict/idempotency handling, and synchronized
preferences. Phase 4 must preserve the offline active-run path and must not
upload location data until the privacy and authorization model has passed
review.

Phase 4 must not begin without separate explicit approval. The user must also
decide whether to accept Phase 3 conditionally and carry the physical-device
matrix forward, or wait until suitable test hardware is available.

**STATUS: AWAITING USER APPROVAL FOR NEXT PHASE**
