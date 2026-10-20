# PaceLab V6.4 — Complete System Overview

> **V6.4 authority note:** For mode-specific announcements, PNG exports, cadence/elevation and analytics, see the final V6.3/V6.4 sections in this document. These take precedence over historical V6.2 statements.


> Status: Approved product specification / architecture design only. No implementation is claimed. 20 October 2026.

## 1. Executive summary

**PaceLab** is a native-first running tracker for athletes who may not own a running watch. It supports normal runs without a plan and advanced structured workouts with multi-block intervals, audible cues, GPS distance and pace, configurable data fields, local recording, cloud history and shareable activity links. The initial user group is **1–10 people**, training on both roads and 400 m tracks. Athletes receive training plans in chat and enter workouts themselves; **no coach dashboard or workout assignment system** is required.

### Constraints and decisions

| Area | Decision |
|---|---|
| Platforms | Android-first, iOS-ready React Native + Expo |
| Development host | Windows, no Mac |
| Budget | Target ฿0 for development and small-scale Android use within free-tier quotas; native iOS distribution is not guaranteed free |
| Authentication | Google primary; Facebook planned; evaluate Apple sign-in for iOS distribution |
| Storage | SQLite local, Supabase Auth/PostgreSQL cloud |
| Sharing | Cloudflare Pages website + restricted share API |
| UX | Dark, high contrast; big running numbers; Free Run one-tap; interval preview required |
| Pace unit | `min/km` default; `min/mi` selectable; distance km/mile |
| Countdown | **One global duration, default 5s**, selectable 3/5/10s; independent switches for three countdown events |

## 2. User stories and use cases

### UC-01: Initial sign-in
1. Launch app; restore existing secure session if present.
2. User signs in with Google; Facebook available once configured.
3. Create or reconcile profile; store tokens in secure storage, not plain SQLite.
4. Load settings from local cache first and reconcile cloud preferences.
5. If offline after a prior sign-in, permit locally authorized recording and defer sync; define behavior for first-time unauthenticated users explicitly.

### UC-02: Free Run
1. Select **Start Free Run**, without creating a workout.
2. Show GPS readiness; if not ready, allow waiting or explicit timer-only mode.
3. Optional five-second pre-start countdown; countdown is excluded from recorded session time/distance.
4. Record duration, distance, and current pace; allow pause/resume/finish.
5. Save locally, display summary, then queue cloud synchronization.
6. Optionally categorize activity as Easy, Recovery, Long, or General.

### UC-03: Create/execute structured workout
1. Enter or select a saved workout; configure warm-up, one or multiple repeat blocks, recoveries, cool-down, and time/distance goals.
2. Validate and **preview the fully expanded chronological timeline** and audio settings.
3. Tap Start → optional pre-start countdown → warm-up → work/recovery steps → cool-down.
4. Keep work/recovery status and set number permanently visible; user-configurable data fields fill the remaining space.
5. Locally persist results for each step and GPS positions. Finish or explicitly stop early; review actual vs planned.

### UC-04: Edit data fields and units
Select a Free Run or Interval layout, choose/reorder metric slots, reset to defaults, lock edits during running. Default unit is km and min/km; switching to mile/min/mi only changes presentation, never stored meter values.

### UC-05: Share completed result
After a completed activity is synced, choose Share → specify safe fields → create an unlisted URL. Recipient views a read-only web summary without account; owner can revoke and optionally expire the link. GPS route and precise endpoints are **not shared by default**.

## 3. Feature inventory

| Feature | Release | Notes |
|---|---|---|
| Free Run duration/distance/pace | P0 | No plan required |
| Structured multi-block intervals | P0 | Time/distance work, recovery, repeats |
| Workout Preview Timeline | P0 | Required before interval start |
| Unified countdown + audio | P0 | Same duration for pre-start/end-of-work/before-next-work |
| GPS recording + quality state | P0 | Native location; outdoor test required |
| Average/current/set/lap pace | P0 | No fake values when GPS uncertain |
| Editable Free Run/Interval dashboards | P0 | Separate saved layouts |
| Google sign-in, SQLite, cloud sync | P0 | Facebook phased after Google |
| Activity history and splits | P0 | Actual vs planned interval result |
| Unlisted share URL with revocation | P0 | Server-side restricted access |
| Manual lap/track assistance | P1 | Explicit lap timing |
| CSV/GPX export | P1 | Export only available fields |
| Advanced biometric devices/social/coach tools | Out of scope | No heart-rate data without sensor |

## 4. Detailed workout definition

A workout is an ordered sequence of blocks. Each block may contain steps and a repetition count. Expanded execution steps have unique IDs, semantic `kind` (WARMUP / WORK / RECOVERY / COOLDOWN), completion criterion (TIME / DISTANCE / MANUAL in a future extension), target value, and optional target pace range. A recovery is inserted **between** repetitions unless the workout explicitly calls for one afterward. Targets are stored in SI units and remain unchanged by user unit preferences.

### Confirmed V6.2 validation fixture

| Step | Count | Seconds each | Total |
|---|---:|---:|---:|
| Warm-up | 1 | 600 | 600 s |
| Work | 6 | 180 | 1080 s |
| Recovery | 5 | 120 | 600 s |
| Cool-down | 1 | 600 | 600 s |
| **Workout** | | | **2880 s = 48:00** |
| Pre-workout countdown | 1 | 5 | Excluded from workout time |

Preview must show six work steps, five recovery steps, enabled warm-up/cool-down and audio timeline. Warm-up/cool-down each default to 10 minutes **for this saved sample only**, not all workouts.

### Countdown rules (V6.2 overrides earlier values)

- Global `countdown_duration_seconds`: **5** default; selectable **3, 5, 10**.
- `start_countdown_enabled`: true by default.
- `end_set_countdown_enabled`: true by default.
- `next_set_countdown_enabled`: true by default.
- Three toggles are independent; their **duration is always the same**.
- Pre-start: 5,4,3,2,1,GO; running time begins at GO.
- End work: 5,4,3,2,1,END inside final five seconds of work.
- Next work: 5,4,3,2,1,GO inside final five seconds of recovery.
- Transitions are instantaneous; countdown **never adds seconds** to work/recovery.
- If a step lasts less than countdown duration, emit only cues corresponding to remaining seconds.
- Never replay missed stale cues in a burst after suspension; log missed cues. Do not emit duplicates on rerender/recovery.
- Distance-based steps use remaining-distance announcements, **not a fabricated exact remaining-time countdown**. Event cues at a transition may still be signaled.
- Time must come from a monotonic clock and native-compatible background execution; do not count JS timer ticks as source of truth.

## 5. Screens and default layouts

| Screen | Primary contents |
|---|---|
| Login | Google, Facebook once enabled; secure session restoration |
| Home | GPS state; large Start Free Run; Structured Workout; navigation |
| Free Run | **Duration, Distance, Current Pace** by default; pause/finish |
| Workout Library | Saved templates, create/edit/delete |
| Workout Builder | Blocks, goals, repeats, recovery and validation |
| Workout Preview | Expanded timeline, estimated time, cues, GPS readiness, Edit / Start |
| Interval Run | Work/Recovery, set #, remaining/elapsed set time, set distance & target if set, pace |
| Activity Summary | Total time/distance, avg pace, split and interval results |
| Activity History | Session list, filters, sync status |
| Activity Sharing | Privacy choices, generate/copy/revoke link |
| Settings | Units, unified countdown, toggles, audio, dashboards, account |

In Interval mode, the default metric slots are set remaining time, set distance, and lap/set time, while work/recovery state and current set stay pinned. If a time-based interval has no distance target, display actual distance and `—` for target, not an invented target. Show GPS-unknown pace as `--:--`.

## 6. Runtime architecture

```text
React Native + Expo mobile app
  ├─ Screens / accessibility / state presentation
  ├─ Application services: sessions, workout playback, sync
  ├─ Pure domain: timeline, metrics, countdown rules, validation
  ├─ Native adapters: monotonic clock, GPS, audio, background execution
  └─ SQLite: templates, GPS samples, checkpoints, sessions, outbox
             └─ idempotent sync (when network available)
                  └─ Supabase Auth + PostgreSQL + RLS
                       └─ share metadata / sanitized snapshots
                            └─ restricted edge/share endpoint
                                 └─ Cloudflare Pages read-only web
```

**Runtime independence:** active workout execution must not depend on Supabase, network availability, or UI frame rendering. Cloud only stores/synchronizes completed or incremental persisted data, subject to a safe outbox protocol.

## 7. GPS engine design and accuracy

- Obtain appropriate foreground and background permissions; distinguish precise vs approximate location.
- Validate timestamps (monotonic ordering), horizontal accuracy, implausible jumps and speeds.
- Accumulate distance only from accepted points; keep raw and validated data logically distinct.
- Current pace uses a configurable rolling distance/time window rather than a single position pair; test smoothing versus lag on actual athletes.
- Do not automatically auto-pause work intervals based on GPS slowdown. Define free-run pause behavior explicitly.
- Track and road conditions differ: curves, buildings, tree cover, power-saving and device chipsets affect results.
- Test on a surveyed route and measured track, multiple laps, multiple devices; publish observed error rather than claiming universal GPS precision.
- On GPS dropout, time-based workout continues; pace/distance become unavailable or marked degraded.

## 8. Persistence and synchronization

Local SQLite is authoritative for **in-progress** work. Cloud is authoritative for synchronized account history. Use stable UUIDs, schema migrations, durable checkpoints and an outbox with retries and exponential backoff. Use idempotent upserts keyed by session UUID. Do not sync raw GPS point-by-point each second. Confirm server writes before setting `SYNCED`. Conflict rules: immutable completed activity measurements; preferences resolve with revision/timestamp and explicit strategy; templates use versioned edits. Graceful logout retains/handles pending local recordings without leaking between accounts.

### Logical cloud schema

| Entity | Important fields |
|---|---|
| `profiles` | id (auth user), display_name, created_at |
| `user_preferences` | user_id, distance_unit, unified countdown seconds, audio toggles |
| `dashboard_layouts` | user_id, mode, slots JSON, revision |
| `workout_templates` | id, user_id, name, version, timestamps |
| `workout_blocks` | id, template_id, order, repetitions |
| `workout_steps` | id, block_id, kind, target_type, target_m_or_ms, optional pace target |
| `running_sessions` | id, user_id, mode, activity_type, status, started/ended, template snapshot |
| `session_step_results` | id, session_id, step reference, elapsed_ms, distance_m |
| `session_laps` | id, session_id, lap_index, elapsed_ms, distance_m |
| `session_metrics` | session_id, elapsed_ms, total_distance_m, average pace derivable |
| `activity_shares` | id, owner_id, session_id, token_hash, scopes, expires_at, revoked_at |
| `share_snapshots` | share_id, sanitized immutable summary, updated_at |

Local extra entities: `gps_points`, `session_checkpoints`, `sync_queue`, `pending_uploads`. Use foreign keys, indexes, checks and **RLS** for all user-owned cloud tables. Public sharing must go through a restricted server endpoint; never grant anonymous access to private session tables.

## 9. Security and privacy

OAuth through suitable native redirect/PKCE flow; no client secrets/service-role credentials inside builds. Securely store access/refresh tokens. Default all activities private. A share URL is an unlisted capability, not account authorization: generate unpredictable tokens, store token hash, expire/revoke, throttle requests and return a sanitized snapshot. Do not expose full GPS track, home start/end positions or user email by default. Provide account deletion, privacy explanation, minimal permissions and relevant provider policies.

## 10. Nonfunctional acceptance

- Workout fixture equals 48:00 and correct repeat order.
- All three enabled countdown events obey one 5-second global duration.
- Pause excludes paused duration and prevents stale/duplicate cues.
- End-to-end free run works without a plan.
- Locked-screen operation and audio are tested on **real devices**, not assumed from compilation.
- GPS tracks, distance, pace and signal state are validated on road and track.
- Offline session save works; sync resumes without duplicates.
- Two different users cannot access each other's data via API.
- Share revocation makes the link inaccessible at the backend.
- App states match reality: GPS unknown is not 0 pace; unsynced is not shared.

## 11. Delivery and platform caveats

Android internal APK distribution can avoid store fees. Windows development is supported; Apple native device provisioning and long-term distribution generally need Apple Developer Program ($99/year) and appropriate cloud signing even if cloud iOS builds can be initiated from Windows. Free service quotas, inactivity rules and app-store/provider policies must be rechecked during implementation. Native APIs improve **background continuity**, but no device can guarantee zero GPS drift, sound latency or operation after forced termination.

## 12. Out of scope and recommended future extensions

No coach dashboard, workout assignment, subscription, AI coach or mandatory social features. Consider later: manual track laps, GPX/CSV exports, cadence via accessory, accessibility voice presets, route privacy masking, structured workout import from a chat-friendly format, and battery profiling.


---

## V6.2 (historical) Addendum — Automatic Kilometer Laps & Personal Records (approved scope)

### Auto-kilometer laps: goals and UI

- Applicable to **Free Run** for audible/visual kilometer announcements; for **Structured Workout**, kilometer boundaries may be stored for analysis but no km speech/banner by default (V6.3 supersedes notification behavior). Record automatic boundaries every **1,000 meters of validated cumulative session distance**, measured from session start, irrespective of work/recovery transitions. A workout step change must not reset automatic-kilometer boundaries.
- An Auto Lap does **not** pause the clock, interrupt or modify a work/recovery step, or overwrite structured-step splits. Auto Kilometer Laps and Workout Step Results are separate series.
- At each qualifying kilometer, show a temporary **non-blocking full-width lap banner/overlay** where the **average pace for that completed kilometer is the largest hero value**, labeled `KM N — AVERAGE PACE`, with `min/km` default; show **total session elapsed time** below it in smaller type. Total distance and lap number may be secondary. Maintain Start/Pause/Safety controls and return to the ordinary running display automatically; audio announcements work even if overlay cannot be shown.
- Default spoken cue (Thai and English localization-ready): “กิโลเมตรที่ 5 เพซเฉลี่ย 4 นาที 42 วินาที เวลารวม 24 นาที 18 วินาที”. Speak km index, completed kilometer *lap-average pace*, and **total elapsed time**; do not mistakenly announce whole-run average pace.
- Free Run Auto Lap enabled by default; Structured Workout kilometer notifications disabled by default (no notification in approved Speedwork behavior); audio announcement independently configurable in Settings; optional visual banner enabled by default. Keep user-selected pace units (`min/km` or `min/mi`) consistent in the display and spoken value while making the triggering **1 kilometer** explicit. A future setting may offer mile-based lap boundaries, but that is not required in V6.2.
- Derive lap crossing time by timestamp interpolation between accepted GPS points when safe; do not use the later GPS callback timestamp blindly. For reduced/poor GPS quality, warn/flag the lap, skip an unverifiable cue or mark it provisional, and never fabricate precise pace. On pause, elapsed time used for session and kilometer pace follows the agreed active-time definition; also retain wall-clock elapsed separately and label the displayed total time consistently.
- Spoken lap cues are independent from unified workout countdown duration (3/5/10 seconds); do not reset or override countdown. **Priority:** mandatory workout transitions and countdown > optional kilometer announcement. Queue a kilometer announcement briefly only when still useful; otherwise skip it, record skip reason, and never overlap speech or play delayed lap announcements after the event is stale.

### Personal Best (PB) and Longest Run

**Tracked distances (canonical meters):** `800`, `1000`, `3000`, `5000`, `10000`, `21097.5` (half marathon), `42195` (marathon). Display friendly labels `800m`, `1K`, `3K`, `5K`, `10K`, `21K / Half Marathon`, `42K / Marathon`; do not approximate the actual half/full marathon record distance to 21,000/42,000 meters.

- PB is the **fastest verified elapsed duration over an exact distance** found in a qualifying activity, including the fastest **contiguous distance window** within a longer activity, not only the first N kilometers. Calculate from chronologically ordered, validated, timestamped GPS distance samples, interpolating crossing times at both ends; explicitly define time basis (elapsed including stops by default for record credibility, unless an administrator-less personal setting defines a separate moving-time statistic), and do not add partial runs as completed PBs.
- PB eligibility: valid complete activity, continuous sufficiently accurate GPS track for the candidate segment, no unresolvable GPS jumps/gaps, no manual distance correction masquerading as measured distance, and no unsupported treadmill/manual entry. Where quality is questionable, show **provisional / not eligible**, not an automatically verified PB. Distances and timing are estimates from consumer GPS, not official race certification.
- A runner can optionally add **manual/historical PRs** with date, time, source and `manual` badge, separate from GPS-verified app records. These must never be silently classified as verified.
- **Longest Run** = greatest validated **total distance from a single completed running session**, not cumulative weekly mileage; label and date the source activity. Keep manual distance separate/marked if ever supported.
- Records may update after an offline run: compute locally once the finalized session is validated, show a pending-sync state, then upsert to cloud with idempotent conflict-safe logic. Recompute when an activity is deleted or invalidated; a record cannot point to a revoked/deleted source. Profile and activity history should show record, achieved date, source session, provenance/validation status.

### V6.2 logical data additions

| Entity | Fields (illustrative) | Purpose |
|---|---|---|
| `session_auto_laps` | `id, session_id, lap_index, start_distance_m, end_distance_m, start_at_ms, end_at_ms, lap_elapsed_ms, average_pace_sec_per_km, gps_quality, cue_status` | Immutable 1 km lap boundaries and lap announcements |
| `personal_records` | `id, user_id, distance_m, best_elapsed_ms, source_session_id, segment_start_ms, segment_end_ms, achieved_at, source_type, verification_status` | Per-distance PB, including rolling segments |
| `longest_run_record` (view or query) | `user_id, session_id, validated_distance_m, achieved_at` | Single-session greatest distance |
| `user_preferences` add | `auto_lap_enabled, auto_lap_audio_enabled, auto_lap_overlay_enabled` | Configurable kilometer notices |

Add unique constraints `(session_id, lap_index)` and for canonical verified PBs `(user_id, distance_m, source_type)` or an explicit current-record projection. PB provenance and deletion/recalculation policies must be documented. Keep raw GPS local by default and synchronize only what is necessary for cloud record consistency or opt-in backup.

### V6.2 additional acceptance criteria

1. During a valid 5,050 m Free Run, emit exactly five 1 km auto laps (not six); display each lap's own average pace as hero, plus total session time as secondary.
2. At a Work/Recovery transition occurring at kilometer N, countdown/transition audio takes precedence and kilometer audio does not overlap or play stale.
3. For a run with 5,000 m in a contiguous segment of a longer run, calculate a 5K PB candidate without requiring the segment to start at activity start; interpolate crossing times and apply GPS-quality eligibility.
4. Track 800m, 1K, 3K, 5K, 10K, 21,097.5m, 42,195m and the longest **single-session** distance, showing `No record yet` when insufficient data exists.
5. Switching between min/km and min/mi changes shown/spoken pace unit without altering canonical 1,000m lap boundaries or stored measurements.
6. Re-syncing the same activity does not duplicate auto laps or PBs; deleting the best-source activity triggers a correct record recalculation.


---

# V6.3 + V6.4 — Consolidated Approved Requirements (supersedes earlier conflicts)

> **Version precedence:** These V6.3/V6.4 rules override any earlier mention of kilometer announcements in Structured Workout. All V6.1 unified countdown decisions and V6.2 personal-record distances remain active. This document describes a planned product, not a shipped application.

## A. Running modes and announcements — authoritative matrix

| Behavior | Free Run (Easy / Recovery / Long / General) | Structured Workout (Speedwork / Interval / Tempo / Threshold) |
|---|---|---|
| Start without planned workout | Yes | No; select/create and preview plan |
| Default live hero metrics | Duration, distance, current pace | Set status, set/lap time, current-set distance and target if known |
| User-configurable fields | Yes | Yes; set number and Work/Recovery remain pinned |
| Split structure in Activity Details | Every full 1,000m + final partial km | Warm-up, each **Work Set**, each **Recovery**, Cool-down; preserve step order |
| Audible kilometer alerts | **ON** by default; announce **that kilometer's average pace** and smaller/secondary **total time** | **OFF** by default; no kilometer announcement during speedwork |
| On-screen km popup | Available Free Run: kilometer average pace as hero; total elapsed time secondary | No km popup by default |
| Spoken completion | Every completed 1km | At completion of each **Work Set**, announce set number, distance, **set average pace**, and time |
| Countdown | Optional pre-start | Unified countdown before start, before Work ends, before next Work begins; each toggle independent |

In Structured Workout, silent 1,000m distance markers may be stored only to aid later research; they do **not** create extra work splits, trigger audible/visual notices, or interrupt countdown. The primary analytical split is `session_step_results`; a `session_auto_laps` record, if stored, must be distinguishable. Work-set completion cues must not obscure critical transitions: play the short END/Recovery transition immediately, then the set summary if audio time permits; skip stale summaries rather than queueing audio over the next countdown. Announce no Recovery as a Work Set. Manual Lap remains a future feature, not a prerequisite for V6.4.

## B. V6.3 — PNG running summary exports

Exactly **two required PNG layout presets** inspired by the two user-provided references, without copying any third-party brand marks:

1. **Landscape Summary Card** (wide, default export canvas 1600 × 900 px, configurable density): dark rounded card; **white GPS route line at left**, three metrics horizontally at right: **Distance, average Pace, Time**, with labels smaller than values. Optional discrete privacy/lock indicator. Route preview is a graphical trace generated locally from the user's recorded GPS points; no paid map tile service required.
2. **Portrait Summary Card** (tall, suggested 1080 × 1920 px; an alternative 1080 × 1350 px should be a later option, not a third required format): dark rounded card; **white GPS route line at top**, below it vertically stacked **Distance, average Pace, Time**, prominent bold values and generous spacing.

Required fields: total session distance, **whole-session average pace**, total elapsed time, route trace when present. The PNG is a *summary*, not a replacement for detailed per-set graphs; later templates for Personal Records or split charts are optional. Use the current unit preference min/km by default or min/mi. Do not label Current Pace as Average Pace. If no valid location route exists, show a neutral `Route unavailable` placeholder; never fabricate a track. Let users hide the route entirely for privacy, optionally trim first/last route sections or display an obfuscated shape, and preview privacy changes **before** exporting. Avoid exposing coordinates, identity, precise home location, EXIF GPS, or live location through embedded metadata. Exact user reference layout is directional; respect responsive safe margins and readable text.

**Actions:** `Save/Download PNG` to device with proper Android/iOS permissions; `Copy Image` to clipboard if binary-image copy is supported by chosen native implementation; `Share Image` through OS native share sheet. **Fallback:** when copy-as-image is unsupported, offer Save/Share rather than silently copying a file path. Show preview with both layouts before export, render at deterministic fixed pixel dimensions, and test legibility at social-sharing size. Generate PNG from local completed session data; do not require server or a working public share link, and do not falsely claim a download succeeded. Shareable **Web URL** remains a separate user action that requires successful Supabase sync and token issuance.

Suggested UI: `Activity Details → Export / Share → PNG → Landscape | Portrait → Preview → Save / Copy / Share`.

## C. V6.4 — Detailed activity analytics and per-mode splits

The `Activity Detail` screen must provide a full record of the actual run with a **map/route**, summary cards, **pace graph**, split table/comparison graph, **cadence** graph when valid, **elevation profile and gradient** when valid, personal-record highlights, and PNG/web sharing. Missing fields should read `— / not available`, never zero or made-up data. All charts allow user selection of a distance/time window; selected lap or Work Set highlights corresponding map and graphs where the collected data has comparable timestamps. Downloading a basic PNG does **not** automatically export all graphs.

### C1. Activity overview metrics

| Area | Values | Accuracy/source note |
|---|---|---|
| Session | mode, activity type, start/end, total elapsed time, active/moving time, paused time, total distance | display the time basis explicitly |
| Pace | average overall pace, moving pace (labeled), best **validated rolling pace**, current pace only during active runs | never compare work-only pace to entire workout average without labeling |
| Laps/Steps | duration, actual distance, average pace, elapsed cumulative time, work/recovery status, target deviation if configured | Free Run=km; Speedwork=steps |
| Cadence | average and peak validated cadence, trend over time and per lap/set | if sensor/API unsupported or unverified, mark unavailable/estimated |
| Altitude | min/max elevation, total climb/descent, elevation profile, grade % | GPS vertical accuracy varies and may be unsuitable for fine grade |
| Route | polyline, trace quality, pauses/gaps | privacy-first; GPS quality flags |
| Records | new 800m/1K/3K/5K/10K/half/full PB, longest single-session run | exact PB distances remain 21097.5m and 42195m |

### C2. Free Run splits

Generate each full 1,000m split from validated accumulated GPS distance, with interpolated boundary times when supported. Show `Km #`, lap distance, lap duration, lap average pace, optional cadence and climb, and a trailing **partial lap** for non-exact totals. This split computation remains useful if the Free Run kilometer voice toggle is off. Plot lap-average pace against kilometer number (lower min/km value = faster). Use time series charts with sensible downsampling that does not hide invalid data gaps.

### C3. Structured Workout splits

Generate splits from **scheduled and actually executed workout step boundaries**, not every kilometer. Show Warm-up, Work Set 1, Recovery 1, …, last Work, Cool-down. For each show actual duration and distance, work/step pace, target and deviation when applicable, optional cadence and ascent. For time-targeted work, graph distance or pace per set; for distance-targeted work, graph time or pace per set. Distinguish completed vs skipped/aborted steps. Never silently treat a Work/Recovery step as a 1-kilometer lap.

### C4. Cadence collection design (device-dependent, P1)

Cadence = steps per minute (`spm`) over a clearly stated time window. Architecture should allow: (a) supported native **step counter** where accessible, (b) permissioned accelerometer estimation with appropriate signal-processing and device-placement tests, and (c) an external footpod BLE source as a later extension. Do **not** claim that `expo-location` alone provides cadence, or assume a phone in hand/pocket/armband produces comparable data. If step data APIs return only aggregate counts, cadence requires deriving rate over timestamped intervals; smoothing and confidence thresholds must be defined. Label `measured`, `estimated`, `external`, or `unavailable`, together with coverage and source. Background collection and OS permission behaviors must be validated separately on Android and iOS. *P1* may remain unavailable on certain devices without failing core running.

### C5. Elevation/gradient design (device-dependent, P1)

Capture GPS altitude only when the platform reports usable vertical accuracy; optionally enhance with barometer or offline elevation model in future. Store altitude, vertical accuracy, timestamp, and distance. Filter jumps and use an elevation smoothing/minimum movement threshold before accumulating **elevation gain/loss** or computing `grade_percent = 100 × rise_m / horizontal_run_m`; reject grade on near-zero run. Display altitude graph vs cumulative distance, segments with gaps, elevation gain/loss and average grade for a selected sufficiently long segment. Avoid interpreting noisy point-to-point GPS altitude as precise hill grade. Users can run normally without elevation data. *P1* when sensor quality allows.

### C6. Interactive analytics graphs

- **P0:** Pace (time-series) and split comparison (per-kilometer for Free Run; per-work/recovery-step for Structured Workout).
- **P1:** Cadence vs elapsed time/distance; elevation vs distance; optional gradient per selected segment; chart synchronized selection/highlight with route and split table.
- Bind all visualizations to stored **actual** samples/aggregates. Pace axis must display min/km or min/mi according to preferences and communicate that lower time is faster. Provide empty states and show approximate data when quality low; never interpolate through major GPS outage without marking it.

## D. V6.4 storage changes and security

| Table / structure | Key fields | Purpose |
|---|---|---|
| `gps_points` local | session_id, ts_monotonic/wall, lat, lon, horizontal_accuracy_m, altitude_m nullable, vertical_accuracy_m nullable, cumulative_distance_m, quality | validated positions / track / altitude |
| `motion_samples` local | session_id, timestamp, steps_total nullable, cadence_spm nullable, source, confidence, collection_state | raw/aggregated step and cadence source |
| `elevation_samples` local | session_id, timestamp, distance_m, altitude_m, vertical_accuracy_m, source, quality | elevation profile and grade |
| `session_auto_laps` | session_id, lap_index, start/end distance, duration, pace, validated_quality | default Free Run kilometer splits; optional silent Structured data |
| `session_step_results` | session_id, step_order, step_kind, set_number nullable, target_kind/value, elapsed_ms, distance_m, pace, completion_status | primary Speedwork splits |
| `session_statistics` | session_id, moving_ms, paused_ms, best_rolling_pace, avg_cadence nullable, max_cadence nullable, ascent_m nullable, descent_m nullable, min/max_elevation nullable, analysis_version | reproducible summary analytics |
| `analysis_points` (derived local) | session_id, bucket_start/end, distance_m, pace_sec_per_unit, cadence nullable, altitude nullable, data_quality | downsampled chart performance |
| `user_preferences` add | structured_set_complete_audio_enabled, structured_auto_km_audio_enabled(default false), png_export_default_format, png_show_route, cadence_collection_enabled | user settings |

Apply schema migrations to SQLite and Supabase, maintain RLS on user-owned records, and use idempotent sync; do not routinely upload raw fine-grained location/motion unless users explicitly opt into backup. Exports are generated on-device, not stored remotely by default. Route traces used in exported cards must respect private metadata masking. Public link summary shows summary/splits only; cadence/elevation/route are private unless explicitly included in sanitized share snapshot.

## E. Acceptance tests — V6.3/V6.4 (additive to V6.1/V6.2)

1. Free Run 5,050m → exactly five full 1km splits plus a 50m partial split; audible km cue if enabled; hero pace = **individual km** pace, total elapsed smaller.
2. Structured 6×180s, recovery 120s, 10-minute warm-up/cool-down → **6 Work + 5 Recovery** results, total 48:00; **zero kilometer spoken alerts**, exactly six set completion events unless user disables them; countdown before transitions respects unified 5s.
3. Speedwork split graph compares work-set values and correctly excludes recovery from work-only averages; recovery still appears in the detailed step table.
4. Free Run pace graph, per-kilometer split table and partial last lap use the same validated GPS source/time basis; no conflicting totals.
5. PNG Landscape and Portrait render cleanly from completed offline sessions, show **whole-run** Distance/Pace/Time, support save/share and binary clipboard copy where supported; fallback without false success messaging. Missing GPS produces **no fabricated route**.
6. Export image contains no location metadata. User can hide/trim trace; preview shows privacy impact. Copy and PNG Save are tested on real Android/iOS versions separately.
7. Cadence metrics/charts appear only with validated step-source observations. Changing phone placement or disabling motion permission yields correct warning/unavailable state rather than fabricated cadence.
8. Vertical GPS noise must not create impossible elevation gain or steep grade; invalid vertical data yields `unavailable` or low-confidence label, and GPS absence does not stop time-based intervals.
9. Chart selection highlights the same real time/distance interval and matching route/lap/set, without exposing private GPS on public shares.
10. Existing PB rolling-segment detection, Longest Run, Share Token revocation, Privacy/RLS, offline/outbox idempotency and 3/5/10s **unified countdown** tests all continue passing.

## F. Updated delivery and priorities

- **P0:** Free Run, Structured Workout, unified countdown, native GPS/pace, per-mode split lists, pace/split graphs, detailed summary basics, PB and Longest Run, V6.3 PNG export in both layouts, privacy-safe link sharing, local/cloud persistence.
- **P1:** cadence sensing/chart where supported, altitude/elevation gain/gradient/profile where reliable, synchronized advanced graph selection, manual laps/track support and extended export templates. Data schema allows optional sensor fields now, while P1 functions must not pretend to be completed in initial MVP.
- **Out of scope:** coach dashboard, forced workout assignment, paid map infrastructure, asserted medically/competition-grade measurement precision, guaranteed tracking after force-quit.
