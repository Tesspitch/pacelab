# PaceLab V6.4 — Developer Guide: Setup, Build, Deploy, Install

> **V6.4 authority note:** For mode-specific announcements, PNG exports, cadence/elevation and analytics, see the final V6.3/V6.4 sections in this document. These take precedence over historical V6.2 statements.


> Step-by-step operational plan for **Windows without a Mac**, Android-first. This guide describes actions to perform **after implementation**; no app/repository/production infrastructure has been created by this document. Always verify versions, pricing and provider screens against official docs.

## 0. Delivery model and budget

| Piece | Delivery | Expected starting cost |
|---|---|---|
| Mobile | React Native + Expo Android APK | ฿0 with local builds or within EAS free quota |
| iOS | React Native codebase; EAS build/sign when eligible | Native long-term distribution typically Apple Developer Program $99/year |
| Identity / records | Supabase Auth + PostgreSQL | Free tier within quota; subject to policy and project inactivity |
| Local data | SQLite | Free |
| Share site | Cloudflare Pages + restricted API | Free tier within quotas |
| Version control | Git / GitHub | Free basic use |

**Important:** Windows can author both platforms. Physical iOS signing and distribution have separate requirements; Expo Go is not a replacement for background GPS/audio testing. Native GPS doesn't guarantee error-free location; background continuity depends on permissions, OS and device power policy.

## 1. Install prerequisites on Windows

1. Install **Git**: https://git-scm.com/downloads
2. Install **Node.js LTS**: https://nodejs.org/en/download (use the current Expo-supported version).
3. Install **VS Code**: https://code.visualstudio.com/
4. Install **Android Studio**: https://developer.android.com/studio (include Android SDK Platform, Platform Tools, build tools, and compatible JDK).
5. Create Expo account: https://expo.dev/.
6. Create Supabase account: https://supabase.com/dashboard.
7. Create Cloudflare account: https://dash.cloudflare.com/.
8. Create Google Cloud project/account: https://console.cloud.google.com/.
9. Create Meta Developer account **only when implementing Facebook Login**: https://developers.facebook.com/.
10. Have at least one real Android device, USB debugging enabled (developer options), a data cable, and a test running route.

Check in PowerShell:

```powershell
node --version
npm --version
git --version
adb version
adb devices
```

If `adb` is missing, configure `ANDROID_HOME`/Android SDK paths and include `platform-tools` in `PATH`; reopen terminal. `adb devices` should list authorized device rather than `unauthorized`.

## 2. Initialize repository (after approval)

For a minimal app spike:

```powershell
npx create-expo-app@latest pacelab
cd pacelab
code .
npx expo start
```

Do not assume `Expo Go` can run required background features. For the full project, choose an agreed monorepo layout before moving code:

```text
pacelab/
  apps/mobile/                  # Expo RN app
  apps/share-web/               # read-only public web
  packages/workout-engine/      # pure TS logic
  packages/running-metrics/     # pure TS calculations
  packages/shared-types/
  supabase/migrations/
  supabase/functions/           # restricted share endpoint if chosen
  docs/
  .env.example
  README.md
```

When adopting a monorepo, configure package-manager workspaces, Metro and EAS accordingly. Keep secrets outside Git; commit `.env.example`, not real `.env` values.

## 3. Build core business logic first

### 3.1 Workout domain

Define `WorkoutTemplate`, `WorkoutBlock`, `WorkoutStep`, `WorkoutSnapshot`, `SessionStepResult` and `CountdownPreferences`. Validate positive time/distance, ordering and correct recovery placement.

**Acceptance fixture**:

```text
Warm-up      600 s
Work         6 × 180 s = 1080 s
Recovery     5 × 120 s = 600 s
Cool-down    600 s
Total        2880 s = 48:00
Pre-start    5 s excluded
```

The fixture must expand to 13 timeline steps (1 warm-up + 6 work + 5 recovery + 1 cool-down).

### 3.2 Countdown implementation

Use one setting `countdown_duration_seconds` = 5 by default (3/5/10 choices), with three independent flags (pre-start / end work / before next work). Never add countdown to work/recovery time. Use a monotonic source of elapsed time; schedule cues from the workout state, not React rerenders. Handle pause/resume, missed cues and deduplication. Native background audio feasibility is a release gate.

### 3.3 GPS/pace prototype

Install only libraries compatible with selected Expo SDK, for example:

```powershell
npx expo install expo-location expo-task-manager expo-sqlite expo-dev-client
```

Configure permission strings, Android foreground-service location behavior and iOS background location capabilities where required. Platform configuration is version-dependent; follow https://docs.expo.dev/versions/latest/sdk/location/ and https://docs.expo.dev/versions/latest/sdk/task-manager/ .

Test filter logic with fixtures, then physically test walk/run samples. Store timestamps, coordinates, reported horizontal accuracy and computed validated track point state. Compute distance in meters, current pace from validated rolling windows, and lap pace from recorded time/distance. Test track loops separately from straight roads.

### 3.4 Audio prototype

Bundle offline beep and number files. Verify speaker/headphones, screen on/off, device audio focus, calls, app background and delayed event behavior. **Do not claim accurate locked-screen audio until measured in a release-like build.** If JS/Expo APIs don't meet reliability requirements, consider a native service/module and update the architecture before release.

### 3.5 SQLite/outbox

Persist sessions incrementally, create checkpoints, and maintain a durable queue of completed results pending upload. On crash/restart, show a recoverable interrupted activity instead of inventing elapsed GPS recording during termination. Use UUIDs for activities and versions for editable templates.

## 4. Create Supabase project and secure schema

1. In https://supabase.com/dashboard choose **New project**.
2. Choose a unique project name, region, strong database password and note the project URL.
3. Get the **publishable/anon client key** for the mobile app. Do **not** use a service-role key in mobile builds.
4. Use the Supabase CLI and committed migrations for schema evolution; create profiles, user_preferences, dashboard_layouts, workout_templates, workout_blocks, workout_steps, running_sessions, session_step_results, session_laps, session_metrics, activity_shares and sanitized share_snapshots.
5. Apply foreign keys, uniqueness, not-null/check constraints and owner indexes.
6. Enable **RLS on every exposed user-owned table** and write policies comparing owner to `auth.uid()`.
7. Test as user A and user B: user B cannot read/change user A's data. Test anonymous access gets no private sessions.
8. Establish backup/export procedure and review free-tier limits and inactivity policy.

Typical mobile environment variable names:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
```

`EXPO_PUBLIC_` values are visible inside client applications; **never** put provider client secrets or Supabase `service_role` secrets there. Secrets for share API belong in server-side secret storage.

## 5. Configure OAuth

### Google first

1. In Google Cloud Console create a project and configure Google Auth Platform branding and test audience.
2. Configure OAuth client(s) and authorized redirect URI per Supabase provider docs.
3. In Supabase Authentication → Providers enable Google and enter required provider credentials securely.
4. Configure redirect URL/deep-link scheme for Expo development and installed builds, not only a browser localhost URL.
5. Use an appropriate native OAuth authorization flow (PKCE where supported).
6. Validate first login, returning login, logout, expired session refresh, cancelled sign-in, redirect failure and duplicate-account handling.

Docs: https://supabase.com/docs/guides/auth/social-login/auth-google and https://docs.expo.dev/guides/authentication/

### Facebook next

1. Create an app in Meta for Developers and add Facebook Login.
2. Configure matching callback URLs and permissions (`public_profile`, `email` if required).
3. Store Meta app secret in Supabase provider configuration, never in app bundle.
4. Add permitted testers while app is in development mode.
5. Complete the necessary public launch/app review requirements before broader access.
6. Test account linking and same-email identities deliberately; do not assume identical emails automatically merge safely.

Docs: https://supabase.com/docs/guides/auth/social-login/auth-facebook

For iOS App Store release, assess applicable alternative sign-in and in-app account deletion requirements using latest Apple Review Guidelines: https://developer.apple.com/app-store/review/guidelines/ .

## 6. Configure local/cloud synchronization

1. Keep recording entirely local during activity.
2. After finish, write immutable session summary, laps and step results into SQLite transaction.
3. Append pending sync item with stable session UUID and revision.
4. When online and authenticated, upsert session and child records in dependency order or via a safe atomic endpoint.
5. Retry with backoff on network/service failures; avoid conflicting concurrent upload workers.
6. Mark `SYNCED` only after response validation; otherwise keep `PENDING` or `FAILED` with retry action.
7. Implement account-scoped outbox handling across logout and account switches.
8. Avoid per-second raw GPS cloud inserts; choose route upload retention policy deliberately.

## 7. Build and install on Android

### Local development build

```powershell
npx expo install expo-dev-client
npx expo run:android
```

This requires a configured Android SDK/device. For EAS, install CLI and configure project:

```powershell
npm install --global eas-cli
eas login
eas build:configure
```

Configure Android `preview` in `eas.json` to produce an installable APK, not merely Play Store AAB. For example (illustrative fragment):

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```

Then:

```powershell
eas build --platform android --profile preview
```

Use returned artifact link; do not invent an APK path. EAS hosted builds have quotas/conditions. If local build is configured, Android APKs can also be generated with Gradle; choose a signed stable release strategy, safeguard keystore and document versioning.

### Installing APK in running group

1. Share trusted APK file/link only with intended runners.
2. They download on Android, verify developer/source, and allow install from that source when prompted.
3. Install and open; log in and grant only required location permissions.
4. In phone settings, review background location/battery policy if necessary, noting device-specific tradeoffs.
5. Run a 2–5 minute short test outside; check timer, audio, GPS quality and save/sync.
6. For updates, use same Android application ID and signing key; bump app version.

## 8. iOS path without owning Mac

You can write the cross-platform RN code on Windows. iOS cloud builds through EAS are possible when iOS signing requirements are met. For physical-device installation through ordinary Expo EAS provisioning and for TestFlight/App Store, **plan for paid Apple Developer membership (normally USD $99/year)**. Apple free personal development signing via local Xcode is not a practical Windows-based distribution solution for a group. iOS simulator/cloud services are useful for limited UI tests, **not substitutes for real iPhone GPS/audio/background validation**.

When funded and authorized: enroll; create bundle ID; configure sign-in and background modes; create EAS credentials; build; distribute to authorized devices/TestFlight; validate on iPhone; comply with privacy/permission/account-deletion review rules.

References: https://docs.expo.dev/build/introduction/ and https://developer.apple.com/programs/ .

## 9. Deploy share website and protected API

1. Create a read-only page at `/run/:token` and expiration/revoked state pages.
2. Choose a restricted API runtime (e.g., Cloudflare Pages Functions/Workers or Supabase Edge Function). Do not use public direct SQL/RLS policy to expose private sessions.
3. Generate cryptographically random unguessable token; save **hash**, owner, scopes, expiration and revocation state server-side.
4. API hashes presented token, validates authorization metadata, returns **sanitized snapshot only** and limits abuse.
5. Keep database privileged key in server-side secrets; set CORS and anti-caching policies appropriate to private/unlisted result pages. Remove confidential data from logs.
6. Deploy share site through Cloudflare Workers & Pages → Create application → Pages, connect Git repository, choose `apps/share-web` build root, build command/output per actual frontend framework.
7. Configure HTTPS, env secrets and SPA/dynamic routing as appropriate.
8. Copy **actual** assigned Cloudflare URL into mobile share configuration. Link cannot be generated while an activity is pending cloud sync.
9. Test valid token, unknown token, expiry, revoked token, disabled sharing, no accidental private GPS exposure, and simultaneous requests.

Docs: https://developers.cloudflare.com/pages/ and https://supabase.com/docs/guides/functions

## 10. Physical QA and release gate

| Test | Minimum expectation |
|---|---|
| Fixed workout | 13 steps and 48:00, plus 5s prestart excluded |
| Countdown settings | 3/5/10 all events share same duration; independent toggles |
| Pause/resume | No time advancement during pause; no cue replay |
| Free Run | Start without template, GPS or timer-only fallback |
| Locked screen | Measure actual GPS and audio behavior, Android model by model |
| Route | Compare distance across known track and road, multiple repeats |
| GPS outage | Time intervals continue; degraded metrics shown honestly |
| Offline | Local activity survives app restart; sync later |
| Security | User A cannot access user B private sessions |
| Share | Public summary only; revocation works |
| APK updates | Install over old signed version without losing SQLite data |

Record build version, device, OS version, battery optimization, test distance, expected vs measured, audio timing, app state and observed failures. Release as **beta** only after critical background/accuracy conditions are validated. Keep issue log and known limitations.

## 11. Operating and maintenance

- Check Supabase free-tier quotas, project inactivity, backups and auth availability periodically.
- Check Cloudflare requests/limits for share API; set token abuse controls.
- Maintain signing key backups safely.
- Keep SDK/dependencies updated with regression testing (especially Android background services).
- Set up crash reporting only with consent/privacy safeguards and within budget.
- Provide privacy policy, data deletion request/account delete flow and support contact before group launch.

## 12. Official docs

- Expo: https://docs.expo.dev/
- Expo location: https://docs.expo.dev/versions/latest/sdk/location/
- Expo task manager: https://docs.expo.dev/versions/latest/sdk/task-manager/
- Expo EAS build: https://docs.expo.dev/build/introduction/
- Supabase authentication: https://supabase.com/docs/guides/auth
- Supabase React Native: https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Cloudflare Pages: https://developers.cloudflare.com/pages/
- Apple Developer Program: https://developer.apple.com/programs/


---

## V6.2 Developer Steps — Auto Lap Announcements & Records

This section extends—not replaces—the setup/build/deploy instructions above. Keep the Windows/Android-first and iOS signing constraints unchanged.

### Step A — Data/domain model

1. Add `session_auto_laps` independent from manual/interval `session_laps` or `session_step_results` and uniqueness on `(session_id, lap_index)`.
2. Add `personal_records` with `user_id`, canonical distance in meters (including **21097.5** for half marathon), record time, source activity/segment, verification status and timestamps. Add configurable auto-lap audio/visual preferences.
3. Add migrations, foreign keys, RLS and source activity deletion/recalculation strategy. Preserve per-user privacy and idempotent upserts.

### Step B — GPS processing, lap boundaries, and pace

1. Extend the validated cumulative-distance stream (meters) to detect each 1000m boundary once. Use GPS timestamps plus interpolation across valid samples to estimate lap crossing times.
2. Store lap elapsed time and lap-average pace separately from **whole-run average** and **current pace**. Decide/label active elapsed versus wall elapsed consistently; for Personal Best use documented elapsed time (including stops) by default.
3. Handle GPS jumps, sparse updates, pause/resume and distance gaps. Flag questionable laps; never show fake precise results. Do not start a second timer for auto laps.
4. Test with synthetic tracks with known crossing times and physically measured road/track courses.

### Step C — UX and audio priority

1. On lap crossing, show a nonblocking overlay: huge **kilometer lap average pace**, smaller **total session elapsed time**; keep navigation and safety controls available.
2. Produce an offline recorded announcement in selected supported language, including kilometer number, lap pace and total elapsed. Verify how dynamic numbers are assembled from clips.
3. Preserve the globally unified countdown duration (default 5 seconds). Priority: interval transitions/countdowns first, auto-kilometer voice second. Limit queue age; do not accumulate stale kilometer messages.
4. Expose toggles for Auto Lap, Auto Lap Voice, and Auto Lap Overlay. Default lap interval is **1 km**, including when pace display unit is min/mi.

### Step D — Personal records computation and persistence

1. On finalized valid activity, evaluate fastest contiguous distance windows for 800m, 1K, 3K, 5K, 10K, 21,097.5m and 42,195m (never round official half/full distance for eligibility).
2. Interpolate exact distance threshold boundaries, record segment start/end and best elapsed duration. Mark insufficient GPS quality as provisional or ineligible. Do not mix manually entered PRs with GPS-verified records.
3. Update the per-user PB and longest completed single-session run, commit locally, enqueue cloud upserts. On activity deletion, recompute best values from remaining qualifying activities.
4. Display Personal Records and Longest Run with date, source session and verification status. Use explicit empty states.

### Step E — Regression testing and deployment

- Unit tests: 999m -> 0 laps; 1000m -> 1; 5050m -> 5; GPS jumps do not generate phantom laps; step transitions do not reset lap distance; pause/resume; km/mi unit transformation; 800m and exact half/full distances.
- Integration tests: countdown and lap cue collision produces one timely primary cue; sync retries do not duplicate lap/PB records; deleting best session recalculates PB.
- Device tests: screen locked, Bluetooth audio, low GPS reception, 60–120 minute recording, both track and road.
- Roll out a signed **Android APK** first through the existing guide. iOS real-device distribution still needs eligible signing/provisioning and usually paid Apple Developer enrollment for cloud-built distributable native apps.

**Deployment check:** Supabase migrations and RLS must be applied before shipping an APK that attempts to upload `session_auto_laps` or `personal_records`. Share website should include kilometer splits/records only if the user opts into exposing them; private records are not automatically public.


---

# V6.4 Developer Extension — Implementation & Verification Steps (design guide)

> Apply these steps when development is explicitly approved. They amend the V6.2 steps above; **Structured Workout kilometer notifications are disabled by default and per-Work-Set announcements replace them.** No build, migration, or deployment has yet occurred.

## 1. Enforce mode-specific split and audio policies

1. Implement a shared accepted-GPS distance accumulator; generate kilometer boundaries for **Free Run** for split tables and optional voice/hero popup. Compute final partial lap at Finish.
2. For Speedwork, prioritize `WorkoutStepCompleted` and `WorkSetCompleted` events; build a step-result table. Disable `KilometerAnnouncement` and `KilometerHeroOverlay` by default on Structured sessions.
3. Audio queue priority: **transition/countdown → Work Set completion summary → optional Free Run kilometer notice**. Mark missed/stale cues as skipped. Do not let voice block the next required countdown.
4. Test 6×180s, 5×120s recovery, 10m warm-up/cool-down and exactly 48-minute total, 6 completed Work Sets, **zero** km spoken alerts.

## 2. PNG export pipeline (no server needed)

1. Build two canonical visual components sized to Landscape 1600×900 and Portrait 1080×1920 pixel export canvases (or equivalent precise render scale).
2. Generate a simple **route polyline** from verified recorded coordinates: project points into a normalized bounding box, preserve aspect ratio and padding, draw pale stroke on dark surface, never infer missing turns. Hide route/trim sensitive endpoints upon user request; allow route-less placeholder.
3. Display **whole activity Distance, Average Pace and Elapsed Time**; unit formatting respects km/mi. Layout follows the two sample references without importing third-party brand identity.
4. Research an actively supported Expo-compatible view-to-image renderer; verify generated PNG dimensions with a decoder, and verify accessible text contrast and safe cropping.
5. Wire native actions `Save to Photos/Files`, `Copy binary PNG to clipboard where supported`, and `Share PNG` through native share sheet. On unsupported clipboard functionality display explicit Save/Share alternatives; do not claim success after just copying a URI/path.
6. Review PNG file metadata and ensure no EXIF location. Clear temp export files, preserve permissions best practices and never upload images by default.
7. Field test Android speaker/clipboard/gallery/chat (including LINE) and separately test iOS when valid build signing available.

## 3. Detailed analytics and charts

1. Define canonical sample time and distance index to align GPS, steps and altitude. Each metric has provenance, confidence and missing-data behavior.
2. Store `session_statistics`, `motion_samples`, `elevation_samples`, `analysis_points` or equivalent derived buckets; migrate local SQLite first and only sync opted-in/safe summaries to cloud.
3. Generate **Free Run per-1km splits** and partial last lap. Generate **Structured per-Work/Recovery Step** results including Warm-up and Cool-down.
4. Add P0 overview, Lap/Set table, time/distance pace chart and comparative split chart. Units format as min/km or min/mi; the chart must not treat faster pace values as larger speed.
5. Integrate motion sensor APIs or step counter carefully for **P1 cadence**; handle Android/iOS permissions and unreliable pocket/hand placement. Mark `measured/estimated/unavailable` and calculate spm from a properly timestamped window. Never invent values when unsupported.
6. Integrate vertical GPS altitude for **P1 elevation** only with usable quality; smooth and accumulate gain/loss over validated movement windows. Require meaningful horizontal distance before computing % grade. Show missing/low-quality rather than unstable climb totals.
7. Add **P1 synchronized chart selection** using timestamps and split/step IDs; highlight matching map track section, never expose precise map/route on public shares by default.
8. Performance test chart rendering on affordable Android devices with long runs; downsample with gap preservation and ensure memory use stays bounded.

## 4. Cloud, account, privacy and release

1. New/changed tables: `session_statistics`, `session_step_results`, `session_auto_laps`, `personal_records`, `user_preferences` additions; local `motion_samples`, `elevation_samples`, `analysis_points`. Use forward migrations and rollback plan where relevant.
2. RLS restricts all cloud user-owned data. Share snapshots include only explicitly authorized summary and splits, never cadence/elevation/route unless approved and sanitized.
3. Preserve UUID-based idempotent sync; PB and Longest Run recomputed if invalidated/deleted. Existing V6.1 countdown settings remain one global `countdown_duration_seconds` 3/5/10 (default 5s).
4. Build Android APK via existing EAS/local instructions and run physical field tests on running track/road, with screen lock, Bluetooth and phone in different locations.
5. Keep iOS marked `not field-validated` until device build/signing/test are actually performed; do not represent Windows cloud iOS compile as proof of reliable background GPS, cadence or audio.

## 5. Extended acceptance checklist

- [ ] 5.05km Free Run: five full km laps + partial, hero lap pace and secondary total time; 5 voice messages when enabled.
- [ ] 6×3min Speedwork: 6 Work completion cues, zero kilometer cues, five recovery steps and 48:00 total with 10m warm-up/cool-down.
- [ ] Speedwork details show Work vs Recovery separately and set charts use per-set values.
- [ ] Both PNG formats match portrait/landscape concept, with true PNG bytes and correct 3 metrics.
- [ ] PNG Save/Copy/Share tested; unsupported binary clipboard behavior uses explicit fallback.
- [ ] Route-less and private/hidden-route export never fabricate or leak location.
- [ ] P0 pace/split charts reflect consistent underlying activity data and user-selected units.
- [ ] P1 cadence/elevation present only on measured or reasonably estimated supported devices, with source and confidence.
- [ ] P1 gradients not calculated from tiny displacement or noisy vertical jumps.
- [ ] All four docs and QA cases remain aligned with V6.4; no paid iOS distribution claimed to be free.
