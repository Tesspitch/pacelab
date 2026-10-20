# PaceLab V6.4 — Phase 0 Architecture and Test Plan

**สถานะ:** Phase 0 complete; awaiting approval for Phase 1
**วันที่ตรวจ:** 20 October 2026
**ขอบเขต:** Architecture, compatibility, risks, and validation planning only. No application code, repository initialization, dependency installation, service provisioning, or deployment was performed.

## 1. Phase 0 outcome

At the Phase 0 inspection time, the workspace contained product and setup documentation but no application source or package manifest. The recommended starting point is an Expo SDK 58 development-build project, with pure TypeScript domain logic separated from native adapters and persistence. Android and iOS are architectural peers; native behavior must be proven separately on real devices.

Expo's official SDK 58 release announcement identifies React Native 0.88. The current project-creation guide recommends explicitly selecting `default@sdk-58` during the transition because an unqualified `create-expo-app@latest` may still create SDK 57, and Expo Go for SDK 58 is not yet generally available. Use a development build, not Expo Go, as the test baseline for background location/audio and native modules.

No current project can be built or unit-tested because no application source exists. This is not evidence of an app build or feature validation.

## 2. Product contract and precedence

### P0

- Free Run without a workout template; optional GPS-wait or explicitly selected timer-only operation.
- Structured workouts with editable warm-up, work, recovery, cool-down, repeat counts, targets, and an expanded preview timeline.
- One global countdown duration (default 5 seconds; 3/5/10 choices) with independent pre-start, end-of-work, and before-next-work switches. Countdown cues do not extend steps; pause/recovery must not produce stale or duplicate cues.
- Offline-first recording and recovery: SQLite is authoritative for active work; durable checkpoints and an idempotent outbox synchronize completed data.
- Validated GPS, honest unknown/degraded states, pace and distance in canonical units, and no timer dependence on network or UI render frequency.
- Mode-specific detail: Free Run full-kilometer and final partial splits; Structured Workout warm-up/work/recovery/cool-down step results.
- PBs at exact canonical distances (800, 1,000, 3,000, 5,000, 10,000, 21,097.5, and 42,195 meters), eligible rolling contiguous windows, and longest single completed run.
- P0 pace and split analytics, summary/history, and two local PNG exports (landscape and portrait) with route privacy controls.
- Google sign-in first, Supabase RLS and sync, and explicitly authorized sanitized share links with server-side validation and revocation.

### P1

- Cadence only from a supported, timestamped step/sensor source with provenance and confidence; never inferred from GPS or pace.
- Elevation/gradient only from usable altitude and validated movement, with noise filtering and low-confidence/unavailable states.
- Linked map/chart selection, advanced sensor charts, manual lap/track support, and extended exports.

### Out of scope

Coach dashboard/assignment, subscription, AI coach, paid map tiles, unsupported heart-rate claims, and guarantees of tracking after force-quit.

### Precedence and identified contradictions

1. The existing specifications and developer guide describe an Android-first delivery order. The current user instruction expressly makes Android and iOS equally important and overrides that order for architecture and planning. This resolves the priority decision; both platforms are included in design and acceptance planning. Phase 2/3 implementation sequencing must still be reviewed against this parity requirement before those phases begin.
2. Historical V6.2 text suggests kilometer alerts during structured workouts. The V6.3/V6.4 consolidated rules explicitly supersede it: Free Run may announce each completed kilometer; Structured Workout has no kilometer announcements by default and announces completed Work Sets instead. This later rule is authoritative.
3. Cadence and elevation are marked P1; their schema may be anticipated, but P1 sensing must not be represented as completed P0 functionality.
4. The developer setup guide expects physical Android testing, but the current user reports no Android device. Emulator checks can cover UI and deterministic logic only; GPS, locked-screen continuity, audio, sensors, and real route accuracy remain blocked until a physical device is available.

## 3. Environment inventory

Read-only inspection found:

| Item | Observed state | Implication |
|---|---|---|
| Workspace | `docs/` only; no source, manifest, README, or app scaffold | No build/test command can validate application behavior yet |
| Git | Workspace is not a Git repository | Do not initialize until separately included in an approved implementation step |
| Node.js | 22.19.0 | Meets the React Native environment guide's documented Node 22.11+ minimum |
| npm | 10.9.3 | Available; use only after an implementation phase authorizes dependency installation |
| Java | 23.0.1 | React Native's current environment guide recommends JDK 17 and warns higher versions may cause issues; reconcile before Android compilation |
| Android SDK | Platforms 31, 34, 35, 36; Build Tools 34.0.0 and 36.0.0 | Useful SDK components are present; exact SDK 58/Gradle requirements still need build-time verification |
| Android emulator | Emulator installed; AVDs `Medium_Phone_API_36.0`, `flutter_emulator`, `flutter_emulator_2`; API 36 and 37.2 images present | Emulator is available for future non-field tests; none was running during inspection |
| Android device | `adb devices -l` returned no connected devices | No physical Android validation is currently possible |
| Expo/EAS CLI | Not found globally | No global install was made or is required for planning |
| iOS build/test | No Mac, Xcode, or iPhone available per user constraints | Native iOS build/signing and device validation are blocked locally |

One Java invocation emitted a Windows paging-file allocation warning; a later `java -version` succeeded. Treat this as a possible host-resource issue to revisit if native builds fail, not as a confirmed Java installation failure.

## 4. Recommended architecture

Use a small npm-workspaces monorepo only after an implementation phase is approved:

```text
apps/
  mobile/                 # Expo React Native UI, navigation, app config
  share-web/              # read-only public activity viewer
packages/
  domain/                 # pure TS workout timeline, state machine, metrics, PBs
  data/                   # SQLite schema/migrations, repositories, outbox
  platform/               # interfaces and Android/iOS native adapters
  shared/                 # validated types and API contracts
supabase/
  migrations/
  functions/               # restricted share endpoint if selected
docs/
```

Keep workout execution independent of rendering, network, and cloud. Inject a monotonic time source, location provider, audio output, local repository, and sync service. Persist recoverable state/checkpoints locally. Maintain separate Free Run auto-kilometer splits and Structured Workout step results.

Canonical persisted units are meters and milliseconds. Convert only for presentation. Keep raw/accepted GPS data and quality decisions distinguishable. Keep fine-grained GPS and sensor samples local by default; upload only an explicitly justified and privacy-reviewed subset.

For shares, issue an unpredictable token, retain only its hash server-side, enforce expiry/revocation and rate limits, and return a sanitized snapshot. Never expose private session tables or privileged credentials to the mobile/web client. Generate PNGs on-device from actual session data; route visibility, trimming, missing-route state, and metadata stripping are part of the export boundary.

## 5. SDK and dependency decisions

### Selected baseline

- **Expo SDK:** 58.0.0, based on Expo's 15 October 2026 announcement and current versioned docs.
- **React Native:** 0.88, as identified in the SDK 58 release announcement.
- **Project template:** explicitly select `default@sdk-58` when initialization is approved; do not rely on an unqualified `@latest` command during the documented SDK transition.
- **Runtime/test type:** native development build. Expo Go is not the acceptance environment for the background-running requirements.
- **Package installation policy:** use the version paired with the selected SDK via Expo's installer and validate with Expo Doctor; commit the lockfile only when repo initialization and implementation are authorized.

### SDK-native candidates

The SDK 58 docs list Android and iOS support for:

- `expo-location` and `expo-task-manager` for location permissions and background task integration.
- `expo-sqlite` for persistent local SQLite.
- `expo-audio` for bundled audio playback and native background audio configuration.
- `expo-file-system` and `expo-sharing` for local export files and OS share sheets.
- `expo-clipboard` for clipboard operations; its SDK 58 API documents image writes as well as text.

These are compatible candidates, not proof that they satisfy product-level reliability. Background location has OS/device limitations, terminated-app behavior is not guaranteed, and Bluetooth disconnection can stop Expo audio playback. Pin exact versions and permissions through the SDK 58 config plugins, then verify each behavior in release-like development builds on both platforms.

PNG view-to-image rendering and sensor/cadence/elevation adapters require a focused compatibility spike before dependency lock-in. Choose only maintained packages with explicit Android/iOS and SDK 58/RN 0.88 support; if binary image clipboard is not supported on a platform, show the specified Save/Share fallback. Do not make a paid map, rendering, or build service a requirement.

## 6. Phase structure aligned to platform parity

Retain the documented phase gates; the plan below adds cross-platform acceptance to each phase without claiming device validation:

| Phase | Scope | Platform parity gate |
|---|---|---|
| 0 — Architecture gate | Requirements, compatibility, module plan, risks, test matrix | Complete; no implementation started |
| 1 — Domain | Shared models, validation, timeline, playback state machine, countdown, pure tests | Same shared deterministic logic is used on Android and iOS |
| 2 — Core app | Free Run, builder/preview, live UI, SQLite, clock/audio proof of concept | Implement native adapter interfaces for both; Android and iOS build compatibility checked |
| 3 — GPS reliability | Permission UX, native background location, distance/pace filters | Separate physical field-test gates on Android and iPhone; neither inferred from emulator |
| 4 — Account & sync | Google Auth, Supabase migrations/RLS, durable outbox; Facebook only after provider setup | Auth redirect, privacy, and sync behaviors tested per platform |
| 5 — History & sharing | Details, splits/graphs, PNG, restricted API, web viewer, revoke | Image save/copy/share and deep links separately validated on Android and iOS |
| 6 — Release | Security review, regression, distribution plan and known limitations | Android package and iOS signing/distribution remain separate release gates; no deployment without approval |

No phase authorizes the next phase. The Android-first sequencing in older docs does not authorize reducing iOS to a later compatibility-only exercise.

## 7. Validation matrix

| Test layer | Windows/CI or emulator | Physical Android | Physical iOS |
|---|---|---|---|
| Domain unit tests | Required: timeline, 48:00 fixture, countdown, pause/resume, unit conversion, splits, PB windows, GPS filters, idempotency rules | Same suite | Same suite |
| Type/build checks | TypeScript, Expo Doctor, Android compile when code exists | Install/run smoke check | Requires macOS/Xcode or authorized remote build for native compile; compile is not field validation |
| UI and permission flows | Emulator smoke tests; simulate denial/degraded/unknown states | Confirm OS prompts/settings | Confirm iOS prompts/background indicators/settings |
| Background runtime | Not proven by emulator | Locked screen, app switching, incoming call, GPS loss, battery restrictions, long run | Locked screen, app switching, interruptions, GPS loss, long run |
| GPS accuracy | Synthetic accepted/rejected point fixtures; emulator location only for functional smoke | Surveyed road/track, repeated laps, multiple devices if available | Equivalent field checks on iPhone |
| Audio | Logic and duplicate/stale-cue tests | Speaker/Bluetooth, focus, screen lock, calls | Speaker/Bluetooth, focus, screen lock, calls |
| PNG/export | Deterministic dimensions, real PNG bytes, missing-route/privacy/metadata tests | Gallery/file save, binary clipboard, native share sheet | Photos/files save, binary clipboard, native share sheet |
| Cloud/security | Local integration tests, RLS policy tests, user A/B and anonymous access, revoke/expiry | Auth redirect and sync on device | Auth redirect and sync on device |

### Required deterministic acceptance fixtures

1. Workout timeline: one 600 s warm-up, six 180 s Work steps, five 120 s Recovery steps, one 600 s cool-down; 13 chronological steps; 2,880 s / 48:00 total; pre-start countdown excluded.
2. Countdown: one selected duration (3/5/10) shared by independently toggled events; cues do not extend steps; pause/resume cannot duplicate or burst stale events.
3. Free Run: a valid 5,050 m track yields five 1 km splits plus one 50 m partial; each completed kilometer pace uses that lap only, with whole-session elapsed time secondary.
4. Structured Workout: six Work Set completion events, five Recovery results, zero kilometer announcements; no Recovery is counted or announced as a Work Set.
5. PB: contiguous-window results use exact target distances and interpolated boundary times; unreliable gaps/jumps are provisional/ineligible; longest run uses one completed session.
6. Analytics and PNG: pace/split figures share one validated source/time basis; both layouts show whole-session average pace; missing route is not fabricated; exports do not contain GPS metadata; privacy trim/hide works.
7. Offline/security: local completion survives restart, retries do not duplicate sessions/laps/records, user A cannot access user B data, and revocation/expiry blocks a share.
8. P1 sensors: cadence/elevation remain unavailable without valid sourced samples; elevation jumps and near-zero grade segments are rejected.

## 8. Risk and decision log

| Risk | Impact | Mitigation / gate |
|---|---|---|
| Expo background tasks are subject to OS scheduling and termination | Timers/audio may not behave as assumed while locked or after force-quit | Keep elapsed time based on monotonic timestamps; prove persistence/recovery and location/audio behavior on real hardware; do not promise post-termination tracking |
| No physical Android device now | Critical GPS/audio/battery criteria cannot pass | Use AVD for code and UI only; obtain or schedule access to a real Android device before Phase 3 acceptance/release |
| No Mac/iPhone | iOS native build, signing and field testing blocked locally | Keep code cross-platform; record iOS as unvalidated until a real signed build/device test; any paid cloud signing/build requires separate authorization |
| JDK 23 installed vs React Native recommendation for JDK 17 | Android Gradle build may fail or be unsupported | Before Phase 2 build, check Expo SDK 58/Gradle matrix and use a compatible JDK; do not install or change system tools in Phase 0 |
| SDK 58/Expo Go transition | Latest unqualified scaffold can target SDK 57; Go may not support SDK 58 immediately | Pin SDK 58 template and use native development builds |
| No image renderer selected | PNG export may not meet deterministic dimensions/privacy/copy requirements | Run a small isolated compatibility proof before committing to a renderer; retain explicit Save/Share fallback |
| Free-tier quotas and provider policies change | Unexpected cost or service interruption | Recheck current limits before account provisioning; no purchase/upgrade without explicit approval; recording remains functional offline |
| Platform policy and store requirements evolve | Permission/auth/distribution rework | Recheck current Google/Apple/provider requirements in relevant phases; no release claim before policy review |

## 9. Phase 0 acceptance and verification

- Read both required primary documents completely and additionally reviewed the developer setup guide.
- Inspected workspace, available SDKs, tool versions, connected devices, and emulator definitions without modifying them.
- Checked current official Expo, React Native, and Apple documentation for SDK versioning, platform APIs, local/cloud build limits, and current host requirements.
- Recorded explicit priority resolution, V6.2/V6.4 precedence, architecture boundaries, package candidates, environment gaps, risks, and test criteria.
- Confirmed no application source, package manifest, repository metadata, dependency installation, service provisioning, or deployment was created during this phase.

**Phase 0 status:** Complete. Phase 1 has not started.

## 10. Official references checked

- [Expo SDK 58 announcement](https://expo.dev/changelog/sdk-58) — published 15 October 2026; identifies React Native 0.88.
- [Expo project creation](https://docs.expo.dev/get-started/create-a-project/) — SDK 58 template guidance and SDK transition note.
- [Expo SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/) — versioned package documentation.
- [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/) and [Expo TaskManager](https://docs.expo.dev/versions/latest/sdk/task-manager/) — Android/iOS support, background configuration and limitations.
- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/) — background playback configuration and Bluetooth limitation.
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/), [Sharing](https://docs.expo.dev/versions/latest/sdk/sharing/), and [Clipboard](https://docs.expo.dev/versions/latest/sdk/clipboard/) — local persistence and platform export/share APIs.
- [Expo local app development](https://docs.expo.dev/guides/local-app-development/) — local Android requires Android Studio; local iOS requires Xcode.
- [Expo iOS build process](https://docs.expo.dev/build-reference/ios-builds/) and [local build limitations](https://docs.expo.dev/build-reference/local-builds/) — remote iOS builds run on macOS; Windows is not supported for EAS local builds.
- [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment) — current Node/JDK/Android SDK recommendations.
- [Apple Developer Program](https://developer.apple.com/programs/) — membership and distribution eligibility; recheck current cost/terms before any commitment.
