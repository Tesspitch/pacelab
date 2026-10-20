import type { CountdownPreferences } from "./types";

export const DEFAULT_COUNTDOWN_PREFERENCES: CountdownPreferences = {
  durationSeconds: 5,
  startCountdownEnabled: true,
  endSetCountdownEnabled: true,
  nextSetCountdownEnabled: true,
};

export function validateCountdownPreferences(
  preferences: CountdownPreferences,
): void {
  if (![3, 5, 10].includes(preferences.durationSeconds)) {
    throw new RangeError("Countdown duration must be 3, 5, or 10 seconds.");
  }
  if (
    typeof preferences.startCountdownEnabled !== "boolean" ||
    typeof preferences.endSetCountdownEnabled !== "boolean" ||
    typeof preferences.nextSetCountdownEnabled !== "boolean"
  ) {
    throw new TypeError("Countdown switches must be boolean values.");
  }
}

export function getCountdownNumber(
  remainingMs: number,
  durationSeconds: CountdownPreferences["durationSeconds"],
  lastEmittedNumber: number | null,
): number | null {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return null;
  }

  const remainingSeconds = Math.min(
    durationSeconds,
    Math.ceil(remainingMs / 1000),
  );

  if (
    remainingMs > durationSeconds * 1000 ||
    (lastEmittedNumber !== null && remainingSeconds >= lastEmittedNumber)
  ) {
    return null;
  }

  return remainingSeconds;
}
