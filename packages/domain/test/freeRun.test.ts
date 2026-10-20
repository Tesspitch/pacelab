import { describe, expect, it } from "vitest";
import {
  createFreeRunState,
  finishFreeRun,
  getFreeRunElapsedMs,
  pauseFreeRun,
  resumeFreeRun,
  startFreeRun,
} from "../src/index.js";

describe("Free Run state machine", () => {
  it("uses monotonic timestamps and excludes paused time", () => {
    const started = startFreeRun(createFreeRunState(), 1_000);
    expect(getFreeRunElapsedMs(started, 6_000)).toBe(5_000);

    const paused = pauseFreeRun(started, 6_000);
    expect(getFreeRunElapsedMs(paused, 20_000)).toBe(5_000);

    const resumed = resumeFreeRun(paused, 21_000);
    expect(getFreeRunElapsedMs(resumed, 24_000)).toBe(8_000);

    const finished = finishFreeRun(resumed, 24_000);
    expect(finished.status).toBe("COMPLETED");
    expect(finished.finalElapsedMs).toBe(8_000);
  });

  it("rejects backwards time and invalid transitions", () => {
    const started = startFreeRun(createFreeRunState(), 10_000);
    expect(() => pauseFreeRun(started, 9_999)).toThrow(RangeError);
    expect(() => startFreeRun(started, 10_000)).toThrow(
      "Cannot start a Free Run",
    );
  });
});
