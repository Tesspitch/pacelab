# PaceLab V6.4 — Master Development Prompt

> **V6.4 authority note:** For mode-specific announcements, PNG exports, cadence/elevation and analytics, see the final V6.3/V6.4 sections in this document. These take precedence over historical V6.2 statements.


> Paste this complete prompt into Codex or a coding agent. The user must explicitly authorize implementation and deployment. This document is a development instruction, **not** evidence that anything has been built.

## Master prompt (English)

You are the lead React Native engineer, software architect, database engineer and QA lead for **PaceLab V6.4**. Build a maintainable, offline-first running tracker for 1–10 athletes, targeting Android first while retaining iOS compatibility. Development takes place on **Windows without a Mac**. Budget target: zero-cost Android development and low-volume hosted usage within free-tier limits. Treat iOS distribution as separately constrained by Apple signing requirements. Use the companion `01_SYSTEM_OVERVIEW.md` as the authoritative product contract.

### Product boundaries

- Provide **Free Run** without creating a plan (Easy, Recovery, Long, General).
- Provide optional **Structured Workout** with multi-block repetitions, work, recovery, warm-up and cool-down; users manually enter their training plans from chat.
- **Do not create a coach dashboard** or assignment system.
- Native-first: React Native + Expo + TypeScript with a development build for GPS/background capabilities; do not substitute PWA for locked-screen running requirements.
- Local SQLite recording plus Supabase Auth, PostgreSQL and RLS, cloud sync and a Cloudflare-hosted read-only share site with restricted token API.
- Social login: Google first, Facebook as subsequent configurable provider, prepare Apple sign-in assessment for iOS release.

### Screens

Splash/session restore, Login, Home, Free Run, Workout Library, Workout Builder, Workout Preview Timeline, Interval Running, Pause/Finish, Activity Summary, Activity History/Detail, Share Activity, Settings, Dashboard Layout Editor, Profile/Account Deletion.

### Required display behavior

- Free Run default **Duration / Distance / Current Pace**.
- Interval default **Set Remaining / Set Distance (actual and target when configured) / Set or Lap Elapsed**; keep Work/Recovery status and Set # always visible. Current pace selectable.
- Let users choose and reorder fields, save independent layouts per mode, reset and lock edits during recording.
- Display km + `min/km` by default; optionally miles + `min/mi`; store canonical meters and milliseconds and only convert in presentation.
- Never fabricate distance target for a time-only interval. Unknown pace shows `--:--`.

### Mandatory workout fixture

- Warm-up enabled, 600 s.
- Six Work repetitions, 180 s each.
- Five Recovery periods **only between reps**, 120 s each.
- Cool-down enabled, 600 s.
- Total session = **2880 seconds = 48:00**, excluding 5 s pre-start countdown.
- All are editable template settings; do not hard-code as app-level limitations.

### Unified countdown — V6.2 (critical)

Implement ONE `countdown_duration_seconds` setting: default **5**, choices **3 / 5 / 10**. Independent enable switches for pre-workout, before work ends, before next work begins (all on initially). Every enabled countdown must use the same duration. Pre-workout countdown is excluded from session time. Other cues take place within existing work/recovery duration without extending steps. Emit 5→4→3→2→1→GO/END as appropriate. Audio triggers must be idempotent across re-renders and state recovery. Pausing freezes logical workout progression and cancels/replans cues. Never burst-play overdue cues after suspension. For distance-based steps, use remaining-distance prompts rather than falsely predicting a precise countdown of seconds to target.

### Domain and architecture

- Separate pure/testable workout timeline expansion, validator, state machine and metrics from UI.
- Separate adapter interfaces for monotonic clock, native location service, audio playback, local repository and sync service.
- Active execution must not depend on network or cloud calls.
- Do not use accumulated `setInterval` ticks as the source of elapsed time. Validate how native background scheduling and audio behave on actual Android and iOS devices. If Expo abstractions cannot achieve specified locked-screen reliability, design an appropriate native module, document tradeoffs and do not claim unsupported reliability.
- Use explicit states: READY, PRESTART, ACTIVE_WORK, ACTIVE_RECOVERY, ACTIVE_WARMUP, ACTIVE_COOLDOWN, PAUSED, COMPLETED, ABORTED; transitions must be deterministic.

### GPS and pace

Native foreground/background location permissions; high-accuracy sampling when appropriate, accuracy/timestamp filters, implausible-jump rejection, validated distance, smoothing for current pace, per-lap/per-set metrics, signal quality indication. A time-based interval continues on GPS failure; GPS-dependent distance completion must have a user-visible degraded-signal policy. GPS accuracy on actual tracks/roads is a measured characteristic, never a blanket promise. Do not infer heart rate/cadence without actual sensors.

### Audio

Local bundled assets for offline count numbers, GO, END, Recovery and beeps. Support speaker/Bluetooth, system audio interruptions, locked screen and resume; avoid overlapping/duplicate audio. Distinguish planned vs actually delivered cues in debug/test logs.

### Storage and cloud

SQLite tables for workout definitions, running sessions, GPS samples, checkpoints, laps, step results, preferences and durable sync outbox. PostgreSQL cloud tables: profiles, user_preferences, dashboard_layouts, workout_templates, workout_blocks, workout_steps, running_sessions, session_step_results, session_laps, session_metrics, activity_shares and sanitized share_snapshots. Model FK/indexes/constraints/migrations. Apply RLS to all user-owned data. Secure tokens. Idempotent UUID upserts, backoff/retries, safe handling of interrupted sync, and explicit conflict policies. Do not upload individual GPS points once per second.

### Sharing

On completed + synchronized activity, user explicitly generates an unpredictable unlisted link. Token stored hashed; restricted API verifies revocation/expiry and returns only sanitized fields (date, type, time, distance, average pace, optional interval splits). GPS routes and exact endpoints are private by default. Users can revoke/share again. Recipients can open web link without PaceLab login. Never expose service credentials in mobile/web client code.

### Testing and delivery

Write unit tests for timeline generation, 6×180/5×120 fixture, countdown, pause/resume, unit conversion, metrics, GPS filters, idempotent sync, authorization and share revocation. Add integration tests for local persist → cloud restore and share API. Maintain a field test matrix for Android real device with screen locked, GPS interrupted, incoming call, Bluetooth headset, one-hour run, different power settings and road/track references. Mark iOS tests **not run** until an actual iPhone build exists. Do not claim a compiled app is physically tested.

Deliver a coherent project with README, `.env.example`, migrations, tests, documentation, a compatibility/risk log, Android build setup, optional iOS build path and secure deployment guide. Never embed OAuth provider secrets or Supabase service-role key in the bundle. Do not deploy, publish, purchase subscriptions or alter production credentials without user approval.

### Required phased workflow

**Phase 0 — Architecture gate:** Inspect repository and current official docs, select compatible SDK/dependencies, lay out modules, create technical plan and testing matrix. Identify Expo and Apple constraints. Ask for authorization before implementing.

**Phase 1 — Domain:** Shared models, workout builder validator, timeline expansion, state machine and unified countdown; automated tests.

**Phase 2 — Android core:** Running UI, Free Run, Interval preview, playback, SQLite, native clock/audio proof of concept.

**Phase 3 — GPS reliability:** Native location adapters, permission UX, distance/pace smoothing, actual device field testing including background.

**Phase 4 — Account & sync:** Google Auth, optional Facebook after provider setup, Supabase migrations/RLS, durable sync, preferences.

**Phase 5 — History & sharing:** Activity summary/splits, restricted API, Cloudflare Pages share viewer, token revoke.

**Phase 6 — Release:** Security review, tests, signed Android APK, installation guide, iOS signing/distribution plan, known limitations.

After every phase: enumerate changed files, tests run and actual results, unresolved device/provider dependencies, security/privacy risks and next steps. Do not proceed to a new implementation or deploy phase without user's authorization if the workspace policy requires explicit approval.

## Suggested agent message for starting Phase 0

> Read `01_SYSTEM_OVERVIEW.md` and `02_MASTER_DEVELOPMENT_PROMPT.md`. Perform Phase 0 only: inspect workspace and environment, propose detailed architecture, package version choices, release gating and test plan. Do not implement, deploy or purchase anything yet. Explicitly analyze native locked-screen GPS and audio feasibility and Windows/no-Mac constraints.

## Review checklist for generated code

- [ ] Interval fixture duration exactly 48:00 and has five recoveries.
- [ ] Countdown unified 5s, 3/5/10 selection, three independent toggles.
- [ ] Free Run does not require Workout ID.
- [ ] No network dependency in active timer/GPS loop.
- [ ] No fictitious set distance targets or GPS pace values.
- [ ] Separate dashboard configurations for both modes.
- [ ] All account-owned rows protected by RLS.
- [ ] Cloud write retries cannot duplicate sessions.
- [ ] Share route sanitized and revocable.
- [ ] Device testing results distinguish Android vs iOS; no unsupported promises.


### V6.2 NON-NEGOTIABLE FEATURE ADDENDUM — AUTO KM LAPS & PERSONAL RECORDS

Implement these alongside the V6.1 requirements; they are mandatory scope, not ideas for a later release. Refer to `01_SYSTEM_OVERVIEW.md` V6.2 addendum as the precise acceptance contract.

**Automatic laps**
- Generate automatic lap boundaries every 1000 meters of validated session distance across Free Run; Structured Workout kilometer boundaries are optional silent analytics-only data, never an announcement trigger by default. Never reset boundaries at work/recovery boundaries. Keep structured workout steps and auto laps as separate entities.
- On lap completion, show a nonblocking temporary summary. Display **that kilometer's average pace as the hero/largest metric** and **total session elapsed time in smaller text**, with km index and distance context.
- Announce by offline audio: kilometer number, *lap* average pace, and total elapsed time. Enable 1 km announcements by default with separate on/off for audio and visual banner. Use selected pace display units, default min/km, while recording canonical 1000m boundaries.
- Use validated GPS samples and safe timestamp interpolation for boundary timing. Do not falsely claim accuracy during GPS gaps/jumps. Give workout countdown and transitions priority over optional auto-lap speech; prevent overlap, duplicate playback, and stale cues. Auto lap audio does not affect globally unified 5-second countdown settings.

**Personal records**
- Distances in meters: 800, 1000, 3000, 5000, 10000, 21097.5 (half marathon), 42195 (marathon). Find the fastest eligible **contiguous subsegment** for each target distance within a completed recorded activity, including longer activities; use interpolated crossing timestamps and an explicitly documented elapsed-time convention.
- Store best time, date, source session, segment boundaries, and validation/provenance status. Refuse automatic verified PB on unreliable/gapped GPS. Optional manually entered historical records remain explicitly marked manual.
- Track **Longest Run** as greatest validated distance in a SINGLE completed activity.
- Update records locally and synchronize safely with idempotent cloud upserts. Re-evaluate records when source activities are deleted or disqualified. Use clear empty/invalid/provisional states.
- Add `session_auto_laps`, `personal_records`, user preferences, schema migrations, RLS, UI for Records and profile highlights.

**Additional tests:** exactly N cues at N full kilometers; non-overlapping audio at interval transitions; unit switching; fastest rolling 800m/1K/3K/5K/10K/21.0975K/42.195K segments; GPS outages; record recalculation on deletion; duplicate upload prevention. Include field testing of Auto Lap voice over Bluetooth in screen-locked mode.


---

## V6.4 MANDATORY OVERRIDE — AUTHORITATIVE V6.3 + V6.4 FEATURE CONTRACT

**Precedence:** If the older V6.2 paragraphs above say to announce every kilometer in Structured Workout, IGNORE those obsolete sentences. V6.3 changes this intentionally: **Free Run announces by kilometer, Speedwork announces by Work Set**. Read the matching V6.4 section of `01_SYSTEM_OVERVIEW.md` as the single source of truth. Preserve V6.1 unified countdown, V6.2 PB/Longest Run.

### Running data and announcement rules

- Free Run generates full 1,000m splits (plus trailing partial split), and optional spoken km messages. On each km, show its **lap-average pace as hero** and cumulative elapsed time as smaller secondary data.
- Structured Workout **does not announce each kilometer**, regardless of cumulative distance. Segment by Warm-up, each Work Set and Recovery, Cool-down. At completed **Work Set**, announce set number, work-set time, work-set distance and **set-average pace**; play short transition cue promptly and avoid stale/overlapping speech. Recovery segments are recorded but not presented as completed work sets.
- Free Run kilometer thresholds must not disturb running timer. In Structured Workout, optional silent automatic distance boundaries may be stored for diagnostics but do not create voice/popup or primary set splits.

### Export finished activity as PNG, two required templates

Implement exactly **Landscape** and **Portrait** activity cards following the provided dark minimal reference composition: pale/white route sketch and three fields: **Distance, overall Average Pace, Total Time**. Landscape: map sketch left and horizontal metrics right, suggest 1600×900; Portrait: sketch top and three vertically stacked metrics, suggest 1080×1920. Fixed deterministic image dimensions and high-contrast typography. Use valid recorded GPS polyline, not generated/fake paths; show neutral fallback when route unavailable. Respect hide/trim route privacy controls, omit coordinate-bearing PNG metadata. Include **Save PNG**, **Copy Image** (actual binary image clipboard when supported, else an explicit Save/Share fallback), and **Share Image** via native share sheet. Build locally/offline from completed session; web activity link is an independent action requiring server sync.

### Detailed Activity Detail & Charts

Implement detailed session overview with: date, type, duration, moving/paused times, total distance, average/moving/best valid pace, route, per-mode splits, charting, PB badges, and Share/Export. Use actual recorded data only.

- **Free Run:** per 1,000m Lap table + final partial Lap: lap duration, distance, average pace; P0 bar/line split comparison and pace-over-time graph.
- **Speedwork:** step table Warm-up → each Work Set → each Recovery → Cool-down, with each step's actual time/distance/pace/target and completion status; P0 Work Set performance comparison chart (time-based compare distance/pace; distance-based compare time/pace) and pace chart. Do not mix Recovery with Work average.
- Cadence is **P1, dependent on device sensor/step API**: record supported step-count/accelerometer measurements with provenance/quality; derive spm over a documented window, graph cadence when valid, show `Unavailable` otherwise. Future optional BLE footpod. NEVER pretend GPS itself supplies cadence or infer accurate cadence from pace.
- Elevation & gradient are **P1, dependent on trustworthy altitude/vertical accuracy**: optionally collect elevation, build smoothed elevation vs distance profile, elevation gain/loss, min/max altitude, and gradient `% = 100 × rise / horizontal run` over safe nonzero segments. Do not advertise precise climb from noisy GPS. Mark low confidence and missing sources.
- **P1:** optional interactive linked chart selection: select lap/set/time window → highlight matching map polyline and pace/cadence/elevation graphs. Avoid interpolation across GPS data gaps.
- Add `motion_samples`, `elevation_samples`, `session_statistics`, chart aggregates/analysis version to local data schema and corresponding opt-in/cloud summary policy. Database migration and RLS must be tested. Data retained locally unless consented backup, minimizing free cloud usage and leakage.

### V6.4 Release gates

Add tests for: no kilometer announcements during Structured Workout; exactly six Work Set completion events and five recoveries for 6×3:00; 48:00 total; 5,050m Free Run → five full-km and one partial; correct lap vs set pace; both PNG templates, Save/Copy/Share fallback, route absence/privacy; realistic cadence unavailable behavior; elevation jump rejection and gradient min-distance checks; graphs reflect real samples; PB distances exact; offline sync idempotence; no PII/GPS leak on shares. Distinguish P0 requirements from P1 sensor enhancements. Test native clipboard and sensor behavior on real devices before claiming support.

**Do not implement or deploy on the strength of this document alone**. Initial agent task remains architectural review unless the user expressly authorizes implementation.
