import { describe, expect, it } from "vitest";
import {
  WorkoutValidationError,
  assertValidWorkout,
  expandWorkoutTimeline,
  getPlannedDurationMs,
  validateWorkout,
} from "../src/index.js";
import type {
  ExpandedWorkoutStep,
  WorkoutDefinition,
  WorkoutStepDefinition,
} from "../src/index.js";

const warmup: WorkoutStepDefinition = {
  id: "warmup",
  kind: "WARMUP",
  goal: { type: "TIME", durationMs: 600_000 },
};

const work: WorkoutStepDefinition = {
  id: "work",
  kind: "WORK",
  goal: { type: "TIME", durationMs: 180_000 },
};

const recovery: WorkoutStepDefinition = {
  id: "recovery",
  kind: "RECOVERY",
  goal: { type: "TIME", durationMs: 120_000 },
};

const cooldown: WorkoutStepDefinition = {
  id: "cooldown",
  kind: "COOLDOWN",
  goal: { type: "TIME", durationMs: 600_000 },
};

const intervalBlock = {
  id: "main",
  repeatCount: 6,
  workSteps: [work],
  recovery,
};

const intervalFixture: WorkoutDefinition = {
  id: "fixture-6x3m",
  name: "Six by three minutes",
  warmup,
  blocks: [intervalBlock],
  cooldown,
};

describe("workout validation and timeline", () => {
  it("expands the approved fixture to 13 steps with five recoveries", () => {
    const timeline = expandWorkoutTimeline(intervalFixture);

    expect(timeline).toHaveLength(13);
    expect(timeline.filter((step) => step.kind === "WORK")).toHaveLength(6);
    expect(timeline.filter((step) => step.kind === "RECOVERY")).toHaveLength(5);
    expect(timeline[0]?.kind).toBe("WARMUP");
    expect(timeline.at(-1)?.kind).toBe("COOLDOWN");
    expect(getPlannedDurationMs(timeline)).toBe(2_880_000);
  });

  it("places recovery only between repetitions and preserves block order", () => {
    const timeline = expandWorkoutTimeline(intervalFixture);
    const mainSteps = timeline.filter((step) => step.blockId === "main");

    expect(
      mainSteps.map((step) => `${step.kind}:${step.repetition}`).join(","),
    ).toBe(
      "WORK:1,RECOVERY:1,WORK:2,RECOVERY:2,WORK:3,RECOVERY:3,WORK:4,RECOVERY:4,WORK:5,RECOVERY:5,WORK:6",
    );
    expect(new Set(timeline.map((step) => step.executionId)).size).toBe(13);
    expect(timeline.map((step) => step.sequence)).toEqual(
      Array.from({ length: 13 }, (_, index) => index),
    );
  });

  it("includes a final recovery only when the workout explicitly requests it", () => {
    const withFinalRecovery: WorkoutDefinition = {
      ...intervalFixture,
      blocks: [
        {
          ...intervalBlock,
          recoveryAfterLastRepetition: true,
        },
      ],
    };
    const timeline = expandWorkoutTimeline(withFinalRecovery);

    expect(timeline.filter((step) => step.kind === "RECOVERY")).toHaveLength(6);
    expect(timeline.at(-2)?.kind).toBe("RECOVERY");
    expect(timeline.at(-1)?.kind).toBe("COOLDOWN");
  });

  it("does not invent a duration for a distance-based step", () => {
    const distanceWorkout: WorkoutDefinition = {
      id: "distance",
      name: "Distance workout",
      blocks: [
        {
          id: "distance-block",
          repeatCount: 1,
          workSteps: [
            {
              id: "400m",
              kind: "WORK",
              goal: { type: "DISTANCE", distanceM: 400 },
            },
          ],
        },
      ],
    };

    expect(getPlannedDurationMs(expandWorkoutTimeline(distanceWorkout))).toBe(
      null,
    );
  });

  it("rejects a planned duration that exceeds safe millisecond precision", () => {
    const timeline = expandWorkoutTimeline({
      id: "large-duration",
      name: "Large duration",
      blocks: [
        {
          id: "block",
          repeatCount: 1,
          workSteps: [
            {
              id: "first",
              kind: "WORK",
              goal: { type: "TIME", durationMs: Number.MAX_SAFE_INTEGER },
            },
            {
              id: "second",
              kind: "WORK",
              goal: { type: "TIME", durationMs: 1 },
            },
          ],
        },
      ],
    });

    expect(() => getPlannedDurationMs(timeline)).toThrow(RangeError);
  });

  it("reports invalid repeats, step placement, and duplicate IDs", () => {
    const invalidWorkout: WorkoutDefinition = {
      ...intervalFixture,
      blocks: [
        {
          id: "main",
          repeatCount: 0,
          workSteps: [
            { ...work, id: "duplicate" },
            { ...work, id: "duplicate", kind: "RECOVERY" },
          ],
          recovery: { ...recovery, id: "duplicate" },
        },
      ],
    };

    const issues = validateWorkout(invalidWorkout);
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "INVALID_REPEAT_COUNT",
        "INVALID_STEP_KIND",
        "DUPLICATE_ID",
      ]),
    );
    expect(() => assertValidWorkout(invalidWorkout)).toThrow(
      WorkoutValidationError,
    );
    expect(() => expandWorkoutTimeline(invalidWorkout)).toThrow(
      WorkoutValidationError,
    );
  });

  it("rejects non-positive targets and inverted pace ranges", () => {
    const invalidWorkout: WorkoutDefinition = {
      id: "bad-target",
      name: "Invalid target",
      blocks: [
        {
          id: "block",
          repeatCount: 1,
          workSteps: [
            {
              id: "work",
              kind: "WORK",
              goal: { type: "TIME", durationMs: 0 },
              targetPace: {
                minSecondsPerKm: 400,
                maxSecondsPerKm: 300,
              },
            },
          ],
        },
      ],
    };

    expect(validateWorkout(invalidWorkout).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["INVALID_GOAL", "INVALID_PACE_RANGE"]),
    );
  });

  it("rejects a final-recovery flag without a recovery step", () => {
    const workout: WorkoutDefinition = {
      id: "bad-recovery",
      name: "Bad recovery",
      blocks: [
        {
          id: "block",
          repeatCount: 1,
          workSteps: [work],
          recoveryAfterLastRepetition: true,
        },
      ],
    };

    expect(validateWorkout(workout).map((issue) => issue.code)).toContain(
      "INVALID_RECOVERY_PLACEMENT",
    );
  });


  it("accepts multiple work steps in a repeated block", () => {
    const multipleWorkSteps: WorkoutDefinition = {
      id: "multiple",
      name: "Multiple work steps",
      blocks: [
        {
          id: "block",
          repeatCount: 2,
          workSteps: [
            work,
            {
              ...work,
              id: "second-work",
              goal: { type: "DISTANCE", distanceM: 800 },
            },
          ],
          recovery,
        },
      ],
    };

    const timeline: readonly ExpandedWorkoutStep[] =
      expandWorkoutTimeline(multipleWorkSteps);
    expect(timeline.map((step) => step.kind)).toEqual([
      "WORK",
      "WORK",
      "RECOVERY",
      "WORK",
      "WORK",
    ]);
  });
});
