# Phase 6 release readiness — 1.0.1

## Completed

- Native Supabase sessions persist securely across app restarts with automatic token refresh.
- Google sign-in uses the `pacelab://auth/callback` deep link and the app requires a signed-in session for cloud-backed screens.
- The app asks for foreground location access as the app opens; active-run tracking retains its explicit background permission behaviour.
- Android configuration blocks unused microphone, storage and overlay permissions, disables Android backup, and carries a signed-release configuration.
- `share-activity` rejects unsupported methods, oversized request bodies and malformed tokens, avoids caching response data, and returns generic server errors.
- Settings now includes a two-stage, destructive confirmation flow to delete the account permanently. It removes the authenticated account and all cloud rows linked by foreign keys; after success it clears all PaceLab-created data on the device and signs out locally.

## Supabase deployment state

Project: `mfhckcklhsgbcdehmqvq` (Singapore).

- `delete-account` Edge Function deployed.
- Hardened `share-activity` Edge Function deployed.
- Migrations `001`, `002`, and `003` were applied earlier in the project setup.

## Automated verification

- Domain tests: 41 passed across 5 test files.
- Type checking: passed for both domain and mobile workspaces.
- Mobile source linting: passed with ESLint invoked directly.

`expo lint` itself cannot complete on this workstation because Windows holds its `.expo` ESLint cache file open (`EPERM`); it does not report a source-lint violation. Direct ESLint was used without the locked cache.

## Required release smoke test

1. Add `pacelab://auth/callback` to the Supabase redirect allow-list.
2. Install the newly built signed APK on a physical Android device.
3. Sign in with Google, force-close and reopen the app, and verify the session is retained.
4. Record and save a short activity; confirm the activity and route appear after reopening the history screen.
5. In Settings, use account deletion only with a disposable test account. Verify the app returns to sign-in and that a fresh sign-in has no historical data.

## Known limits

- iOS has not been field-validated; it needs Apple signing and a physical iPhone test.
- Long outdoor runs, screen lock, Bluetooth audio and poor-GPS behaviour still require physical field testing.
- Dependency audit results are primarily inherited from the Expo/Metro toolchain. No forced dependency downgrade was applied because the offered automated remediation would break the Expo-compatible dependency set.
