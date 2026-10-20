import { describe, expect, it } from "vitest";
import {
  DEFAULT_COUNTDOWN_PREFERENCES,
  getCountdownNumber,
  validateCountdownPreferences,
} from "../src/index.js";
import type { CountdownPreferences } from "../src/index.js";

const preferences: CountdownPreferences = {
  durationSeconds: 5,
  startCountdownEnabled: true,
  endSetCountdownEnabled: true,
  nextSetCountdownEnabled: true,
};

describe("unified countdown", () => {
  it("defaults to one enabled five-second duration for all three events", () => {
    expect(DEFAULT_COUNTDOWN_PREFERENCES).toEqual({
      durationSeconds: 5,
      startCountdownEnabled: true,
      endSetCountdownEnabled: true,
      nextSetCountdownEnabled: true,
    });
  });

  it.each([3, 5, 10] as const)(
    "uses the configured %i-second duration",
    (durationSeconds) => {
      const configured = { ...preferences, durationSeconds };
      expect(() => validateCountdownPreferences(configured)).not.toThrow();
      expect(
        getCountdownNumber(durationSeconds * 1000, durationSeconds, null),
      ).toBe(durationSeconds);
    },
  );

  it("skips missed numbers instead of replaying them in a burst", () => {
    expect(getCountdownNumber(2_400, 5, null)).toBe(3);
    expect(getCountdownNumber(1_400, 5, 3)).toBe(2);
    expect(getCountdownNumber(900, 5, 2)).toBe(1);
    expect(getCountdownNumber(900, 5, 1)).toBeNull();
  });

  it("counts down once from the configured duration to one", () => {
    let lastNumber: number | null = null;
    const numbers: number[] = [];

    for (let remainingSeconds = 5; remainingSeconds >= 1; remainingSeconds -= 1) {
      const number = getCountdownNumber(
        remainingSeconds * 1000,
        5,
        lastNumber,
      );
      if (number !== null) {
        numbers.push(number);
        lastNumber = number;
      }
    }

    expect(numbers).toEqual([5, 4, 3, 2, 1]);
    expect(getCountdownNumber(0, 5, lastNumber)).toBeNull();
  });

  it("emits only the remaining seconds for a short step", () => {
    expect(getCountdownNumber(2_000, 5, null)).toBe(2);
    expect(getCountdownNumber(1_000, 5, 2)).toBe(1);
  });

  it("rejects unsupported durations and invalid switches", () => {
    expect(() =>
      Reflect.apply(validateCountdownPreferences, undefined, [
        { ...preferences, durationSeconds: 4 },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      Reflect.apply(validateCountdownPreferences, undefined, [
        { ...preferences, startCountdownEnabled: "yes" },
      ]),
    ).toThrow(TypeError);
  });
});
