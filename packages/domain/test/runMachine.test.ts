import { describe, expect, it } from "vitest";
import {
  abortWorkoutRun,
  advanceWorkoutRun,
  createWorkoutRunState,
  expandWorkoutTimeline,
  finishWorkoutRun,
  getSessionElapsedMs,
  pauseWorkoutRun,
  reportStepDistance,
  resumeWorkoutRun,
  startWorkoutRun,
} from "../src/index.js";
import type {
  CountdownPreferences,
  WorkoutDefinition,
  WorkoutRunEvent,
  WorkoutStepDefinition,
} from "../src/index.js";

const allCountdowns: CountdownPreferences = {
  durationSeconds: 5,
  startCountdownEnabled: true,
  endSetCountdownEnabled: true,
  nextSetCountdownEnabled: true,
};

const noCountdowns: CountdownPreferences = {
  durationSeconds: 5,
  startCountdownEnabled: false,
  endSetCountdownEnabled: false,
  nextSetCountdownEnabled: false,
};

function simpleWorkout(
  goal: WorkoutStepDefinition["goal"],
  followingStep?: WorkoutStepDefinition,
): WorkoutDefinition {
  const recovery: WorkoutStepDefinition = {
    id: "recovery",
    kind: "RECOVERY",
    goal: { type: "TIME", durationMs: 2_000 },
  };

  return {
    id: "simple",
    name: "Simple workout",
    blocks: [
      {
        id: "main",
        repeatCount: 1,
        workSteps: [
          { id: "work", kind: "WORK", goal },
        ],
        ...(followingStep ? { recovery } : {}),
      },
    ],
    ...(followingStep ? { cooldown: followingStep } : {}),
  };
}

function createRun(
  workout: WorkoutDefinition,
  countdown: CountdownPreferences = allCountdowns,
) {
  return createWorkoutRunState(expandWorkoutTimeline(workout), countdown);
}

function eventsOfType<T extends WorkoutRunEvent["type"]>(
  events: readonly WorkoutRunEvent[],
  type: T,
): Extract<WorkoutRunEvent, { type: T }>[] {
  return events.filter(
    (event): event is Extract<WorkoutRunEvent, { type: T }> =>
      event.type === type,
  );
}

describe("workout run state machine", () => {
  it("excludes pre-start countdown from session time", () => {
    const started = startWorkoutRun(
      createRun(simpleWorkout({ type: "TIME", durationMs: 10_000 })),
      0,
    );
    expect(started.state.status).toBe("PRESTART");
    expect(eventsOfType(started.events, "COUNTDOWN_NUMBER")[0]?.number).toBe(
      5,
    );
    expect(getSessionElapsedMs(started.state, 4_000)).toBe(0);

    const count = advanceWorkoutRun(started.state, 1_000);
    expect(eventsOfType(count.events, "COUNTDOWN_NUMBER")[0]).toMatchObject({
      number: 4,
      scheduledAtMs: 1_000,
    });

    const go = advanceWorkoutRun(count.state, 5_000);
    expect(go.state.status).toBe("ACTIVE_WORK");
    expect(go.state.activeStartedAtMs).toBe(5_000);
    expect(eventsOfType(go.events, "COUNTDOWN_GO")[0]?.purpose).toBe("START");
    expect(getSessionElapsedMs(go.state, 5_000)).toBe(0);
  });

  it("logs missed pre-start cues and suppresses a stale GO", () => {
    const started = startWorkoutRun(
      createRun(simpleWorkout({ type: "TIME", durationMs: 30_000 })),
      0,
    );
    const delayed = advanceWorkoutRun(started.state, 7_000);

    expect(delayed.state.status).toBe("ACTIVE_WORK");
    expect(delayed.state.activeStartedAtMs).toBe(5_000);
    expect(getSessionElapsedMs(delayed.state, 7_000)).toBe(2_000);
    expect(
      eventsOfType(delayed.events, "CUE_SKIPPED")
        .filter((event) => event.purpose === "PRESTART")
        .map((event) => event.number),
    ).toEqual([4, 3, 2, 1]);
    expect(eventsOfType(delayed.events, "COUNTDOWN_GO")[0]?.audible).toBe(
      false,
    );
    expect(
      eventsOfType(delayed.events, "CUE_SKIPPED").some(
        (event) => event.purpose === "START",
      ),
    ).toBe(true);
  });

  it("starts immediately when pre-start countdown is disabled", () => {
    const started = startWorkoutRun(
      createRun(
        simpleWorkout({ type: "TIME", durationMs: 5_000 }),
        noCountdowns,
      ),
      100,
    );
    expect(started.state.status).toBe("ACTIVE_WORK");
    expect(started.state.activeStartedAtMs).toBe(100);
    expect(eventsOfType(started.events, "COUNTDOWN_NUMBER")).toHaveLength(0);
  });

  it("freezes active time and countdown progress while paused", () => {
    const started = startWorkoutRun(
      createRun(
        simpleWorkout({ type: "TIME", durationMs: 5_000 }),
        { ...allCountdowns, startCountdownEnabled: false },
      ),
      100,
    );
    const paused = pauseWorkoutRun(started.state, 2_100);
    expect(paused.state.status).toBe("PAUSED");
    expect(eventsOfType(paused.events, "COUNTDOWN_NUMBER")).toMatchObject([
      { number: 3, purpose: "END_WORK" },
    ]);
    expect(getSessionElapsedMs(paused.state, 2_100)).toBe(2_000);
    expect(getSessionElapsedMs(paused.state, 10_000)).toBe(2_000);

    const resumed = resumeWorkoutRun(paused.state, 12_100);
    expect(resumed.state.status).toBe("ACTIVE_WORK");
    expect(eventsOfType(resumed.events, "COUNTDOWN_NUMBER")).toHaveLength(0);
    expect(getSessionElapsedMs(resumed.state, 13_100)).toBe(3_000);

    const completed = advanceWorkoutRun(resumed.state, 15_100);
    expect(completed.state.status).toBe("COMPLETED");
    expect(completed.state.finalElapsedMs).toBe(5_000);
    expect(eventsOfType(completed.events, "COUNTDOWN_END")[0]?.audible).toBe(
      true,
    );
  });

  it("pauses and resumes pre-start countdown without consuming its duration", () => {
    const started = startWorkoutRun(
      createRun(simpleWorkout({ type: "TIME", durationMs: 2_000 })),
      0,
    );
    const paused = pauseWorkoutRun(started.state, 2_000);
    const resumed = resumeWorkoutRun(paused.state, 20_000);
    expect(resumed.state.status).toBe("PRESTART");
    expect(eventsOfType(resumed.events, "COUNTDOWN_NUMBER")).toHaveLength(0);

    const go = advanceWorkoutRun(resumed.state, 23_000);
    expect(go.state.status).toBe("ACTIVE_WORK");
    expect(go.state.activeStartedAtMs).toBe(23_000);
    expect(getSessionElapsedMs(go.state, 23_000)).toBe(0);

    const completed = advanceWorkoutRun(go.state, 25_000);
    expect(completed.state.finalElapsedMs).toBe(2_000);
  });

  it("emits only a current countdown number after a delayed update", () => {
    const active = startWorkoutRun(
      createRun(
        simpleWorkout({ type: "TIME", durationMs: 30_000 }),
        { ...allCountdowns, startCountdownEnabled: false },
      ),
      0,
    );
    const observed = advanceWorkoutRun(active.state, 5_000);
    const late = advanceWorkoutRun(observed.state, 28_500);

    expect(eventsOfType(late.events, "COUNTDOWN_NUMBER")).toMatchObject([
      { number: 2, purpose: "END_WORK", audible: true },
    ]);
    expect(
      eventsOfType(late.events, "CUE_SKIPPED").map((event) => event.number),
    ).toEqual([5, 4, 3]);
  });

  it("uses only the available countdown for a short time step", () => {
    const started = startWorkoutRun(
      createRun(simpleWorkout({ type: "TIME", durationMs: 2_000 })),
      0,
    );
    const go = advanceWorkoutRun(started.state, 5_000);
    expect(eventsOfType(go.events, "COUNTDOWN_NUMBER")).toMatchObject([
      { number: 2, purpose: "END_WORK" },
    ]);

    const last = advanceWorkoutRun(go.state, 6_000);
    expect(eventsOfType(last.events, "COUNTDOWN_NUMBER")).toMatchObject([
      { number: 1, purpose: "END_WORK" },
    ]);
  });

  it("does not emit stale audio cues after a long suspension", () => {
    const started = startWorkoutRun(
      createRun(
        simpleWorkout({ type: "TIME", durationMs: 1_000 }),
        { ...allCountdowns, startCountdownEnabled: false },
      ),
      0,
    );
    const delayed = advanceWorkoutRun(started.state, 5_000);

    expect(delayed.state.status).toBe("COMPLETED");
    expect(eventsOfType(delayed.events, "COUNTDOWN_END")[0]?.audible).toBe(
      false,
    );
    expect(
      eventsOfType(delayed.events, "WORK_SET_COMPLETED")[0]?.audible,
    ).toBe(false);
    expect(eventsOfType(delayed.events, "COUNTDOWN_NUMBER")).toHaveLength(0);
    expect(
      eventsOfType(delayed.events, "CUE_SKIPPED").map((event) => event.purpose),
    ).toEqual(["END_WORK", "END_WORK", "WORK_SET_COMPLETION"]);
  });

  it("requires real distance progress for distance-based steps", () => {
    const started = startWorkoutRun(
      createRun({ ...simpleWorkout({ type: "DISTANCE", distanceM: 400 }) }, noCountdowns),
      0,
    );
    const active = advanceWorkoutRun(started.state, 1_000);
    expect(active.state.status).toBe("ACTIVE_WORK");
    expect(eventsOfType(active.events, "COUNTDOWN_NUMBER")).toHaveLength(0);

    const partial = reportStepDistance(active.state, 250, 2_000);
    expect(partial.state.stepDistanceM).toBe(250);
    expect(partial.state.status).toBe("ACTIVE_WORK");
    expect(eventsOfType(partial.events, "DISTANCE_PROGRESS")).toMatchObject([
      { remainingDistanceM: 150, atMs: 2_000 },
    ]);
    const duplicate = reportStepDistance(partial.state, 250, 2_000);
    expect(eventsOfType(duplicate.events, "DISTANCE_PROGRESS")).toHaveLength(0);

    const complete = reportStepDistance(partial.state, 400, 5_000);
    expect(complete.state.status).toBe("COMPLETED");
    expect(eventsOfType(complete.events, "WORK_SET_COMPLETED")).toHaveLength(1);
    expect(eventsOfType(complete.events, "STEP_COMPLETED")[0]?.actualDistanceM)
      .toBe(400);
    expect(complete.state.finalElapsedMs).toBe(5_000);
    expect(() => reportStepDistance(complete.state, 500, 5_000)).toThrow(
      "Distance progress requires an active workout.",
    );
  });

  it("records measured distance on time-based steps without inventing a target", () => {
    const started = startWorkoutRun(
      createRun(
        simpleWorkout({ type: "TIME", durationMs: 5_000 }),
        noCountdowns,
      ),
      0,
    );
    const progress = reportStepDistance(started.state, 321.5, 4_000);
    expect(progress.state.status).toBe("ACTIVE_WORK");
    expect(progress.events).toHaveLength(0);

    const completed = advanceWorkoutRun(progress.state, 5_000);
    expect(eventsOfType(completed.events, "STEP_COMPLETED")[0]).toMatchObject({
      actualDistanceM: 321.5,
      actualElapsedMs: 5_000,
    });
  });

  it("rejects backwards time and distance", () => {
    const started = startWorkoutRun(
      createRun(
        simpleWorkout({ type: "DISTANCE", distanceM: 400 }),
        noCountdowns,
      ),
      0,
    );
    const partial = reportStepDistance(started.state, 200, 1_000);

    expect(() => advanceWorkoutRun(partial.state, 999)).toThrow(RangeError);
    expect(() => reportStepDistance(partial.state, 100, 1_000)).toThrow(
      RangeError,
    );
  });

  it("records six Work Set completions and five recoveries for the fixture", () => {
    const workout: WorkoutDefinition = {
      id: "fixture",
      name: "6 x 3 minutes",
      warmup: {
        id: "warmup",
        kind: "WARMUP",
        goal: { type: "TIME", durationMs: 600_000 },
      },
      blocks: [
        {
          id: "main",
          repeatCount: 6,
          workSteps: [
            {
              id: "work",
              kind: "WORK",
              goal: { type: "TIME", durationMs: 180_000 },
            },
          ],
          recovery: {
            id: "recovery",
            kind: "RECOVERY",
            goal: { type: "TIME", durationMs: 120_000 },
          },
        },
      ],
      cooldown: {
        id: "cooldown",
        kind: "COOLDOWN",
        goal: { type: "TIME", durationMs: 600_000 },
      },
    };
    let state = createRun(workout, noCountdowns);
    let result = startWorkoutRun(state, 0);
    state = result.state;
    expect(state.status).toBe("ACTIVE_WARMUP");
    const allEvents: WorkoutRunEvent[] = [...result.events];

    for (const step of state.timeline) {
      if (step.goal.type !== "TIME") {
        throw new Error("Fixture should contain time-based steps only.");
      }
      expect(state.status).toBe(`ACTIVE_${step.kind}`);
      const stepEndMs = (state.stepStartedAtMs ?? 0) + step.goal.durationMs;
      result = advanceWorkoutRun(state, stepEndMs);
      state = result.state;
      allEvents.push(...result.events);
    }

    expect(state.status).toBe("COMPLETED");
    expect(state.finalElapsedMs).toBe(2_880_000);
    expect(eventsOfType(allEvents, "WORK_SET_COMPLETED")).toHaveLength(6);
    expect(
      eventsOfType(allEvents, "STEP_COMPLETED").filter(
        (event) => event.step.kind === "RECOVERY",
      ),
    ).toHaveLength(5);
    expect(
      allEvents.map((event) => event.type),
    ).not.toContain("KILOMETER_ANNOUNCEMENT");
  });

  it("keeps the transition cue before the Work Set summary", () => {
    const workout = simpleWorkout(
      { type: "TIME", durationMs: 1_000 },
      {
        id: "cooldown",
        kind: "COOLDOWN",
        goal: { type: "TIME", durationMs: 5_000 },
      },
    );
    const started = startWorkoutRun(
      createRun(workout, {
        ...allCountdowns,
        startCountdownEnabled: false,
      }),
      0,
    );
    const completed = advanceWorkoutRun(started.state, 1_000);
    const transitionIndex = completed.events.findIndex(
      (event) => event.type === "COUNTDOWN_END",
    );
    const summaryIndex = completed.events.findIndex(
      (event) => event.type === "WORK_SET_COMPLETED",
    );

    expect(transitionIndex).toBeGreaterThanOrEqual(0);
    expect(summaryIndex).toBeGreaterThan(transitionIndex);
  });

  it("uses the independent next-work countdown inside recovery", () => {
    const workout: WorkoutDefinition = {
      id: "two-sets",
      name: "Two short sets",
      blocks: [
        {
          id: "main",
          repeatCount: 2,
          workSteps: [
            {
              id: "work",
              kind: "WORK",
              goal: { type: "TIME", durationMs: 1_000 },
            },
          ],
          recovery: {
            id: "recovery",
            kind: "RECOVERY",
            goal: { type: "TIME", durationMs: 2_000 },
          },
        },
      ],
    };
    const started = startWorkoutRun(
      createRun(workout, {
        durationSeconds: 5,
        startCountdownEnabled: false,
        endSetCountdownEnabled: false,
        nextSetCountdownEnabled: true,
      }),
      0,
    );
    const recovery = advanceWorkoutRun(started.state, 1_000);
    expect(recovery.state.timeline[recovery.state.stepIndex]?.kind).toBe(
      "RECOVERY",
    );

    const countdown = advanceWorkoutRun(recovery.state, 2_000);
    expect(eventsOfType(countdown.events, "COUNTDOWN_NUMBER")).toMatchObject([
      { number: 1, purpose: "BEFORE_NEXT_WORK" },
    ]);

    const nextWork = advanceWorkoutRun(countdown.state, 3_000);
    expect(eventsOfType(nextWork.events, "COUNTDOWN_GO")[0]).toMatchObject({
      purpose: "NEXT_WORK",
      audible: true,
    });
    expect(nextWork.state.timeline[nextWork.state.stepIndex]?.kind).toBe(
      "WORK",
    );
  });

  it("aborts explicitly and does not advance after abort", () => {
    const started = startWorkoutRun(
      createRun(
        simpleWorkout({ type: "TIME", durationMs: 10_000 }),
        noCountdowns,
      ),
      0,
    );
    const aborted = abortWorkoutRun(started.state, 2_000);
    expect(aborted.state.status).toBe("ABORTED");
    expect(aborted.state.finalElapsedMs).toBe(2_000);
    expect(advanceWorkoutRun(aborted.state, 2_000).events).toHaveLength(0);
  });

  it("finishes early without fabricating completion of the active step", () => {
    const started = startWorkoutRun(
      createRun(
        simpleWorkout({ type: "TIME", durationMs: 10_000 }),
        noCountdowns,
      ),
      0,
    );
    const finished = finishWorkoutRun(started.state, 2_000);
    expect(finished.state.status).toBe("COMPLETED");
    expect(finished.state.finalElapsedMs).toBe(2_000);
    expect(eventsOfType(finished.events, "STEP_COMPLETED")).toHaveLength(0);
    expect(eventsOfType(finished.events, "WORKOUT_COMPLETED")).toHaveLength(1);
  });
});
