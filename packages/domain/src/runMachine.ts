import {
  DEFAULT_COUNTDOWN_PREFERENCES,
  getCountdownNumber,
  validateCountdownPreferences,
} from "./countdown.js";
import type {
  ActiveRunStatus,
  CountdownPurpose,
  ExpandedWorkoutStep,
  RunStatus,
  RunTransition,
  WorkoutRunEvent,
  WorkoutRunState,
} from "./types.js";

const MAX_AUDIO_CUE_LATENESS_MS = 1000;

function isActiveRunStatus(status: RunStatus): status is ActiveRunStatus {
  return status.startsWith("ACTIVE_");
}

function getActiveStatus(step: ExpandedWorkoutStep): ActiveRunStatus {
  return `ACTIVE_${step.kind}`;
}

function assertTimestamp(nowMs: number): void {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new RangeError("Monotonic timestamps must be finite and non-negative.");
  }
}

function assertNotBeforeLastObservation(
  state: WorkoutRunState,
  nowMs: number,
): void {
  assertTimestamp(nowMs);
  if (
    state.lastObservedAtMs !== null &&
    nowMs < state.lastObservedAtMs
  ) {
    throw new RangeError("Run timestamps must be monotonically non-decreasing.");
  }
}

function canPlayAt(nowMs: number, scheduledAtMs: number): boolean {
  return nowMs >= scheduledAtMs &&
    nowMs - scheduledAtMs <= MAX_AUDIO_CUE_LATENESS_MS;
}

function createSkippedCountdownEvents(
  purpose: CountdownPurpose,
  lastEmittedNumber: number | null,
  highestPossibleNumber: number,
  lowestUnskippedNumber: number,
  stepStartedAtMs: number,
  stepEndsAtMs: number,
): WorkoutRunEvent[] {
  const firstMissedNumber =
    lastEmittedNumber === null
      ? highestPossibleNumber
      : lastEmittedNumber - 1;
  const events: WorkoutRunEvent[] = [];

  for (
    let number = firstMissedNumber;
    number > lowestUnskippedNumber;
    number -= 1
  ) {
    events.push({
      type: "CUE_SKIPPED",
      purpose,
      number,
      scheduledAtMs: Math.max(stepStartedAtMs, stepEndsAtMs - number * 1000),
      reason: "STALE",
    });
  }

  return events;
}

function getCurrentStep(state: WorkoutRunState): ExpandedWorkoutStep {
  const step = state.timeline[state.stepIndex];
  if (!step) {
    throw new Error("The active workout step is missing from the timeline.");
  }
  return step;
}

function startStep(
  state: WorkoutRunState,
  stepIndex: number,
  atMs: number,
): RunTransition {
  const step = state.timeline[stepIndex];
  if (!step) {
    throw new Error("Cannot start a workout step outside the timeline.");
  }

  return {
    state: {
      ...state,
      status: getActiveStatus(step),
      stepIndex,
      stepStartedAtMs: atMs,
      stepDistanceM: null,
      lastCountdownNumber: null,
      prestartStartedAtMs: null,
      pausedAtMs: null,
      pausedFromStatus: null,
      lastObservedAtMs: atMs,
    },
    events: [{ type: "STEP_STARTED", step, atMs }],
  };
}

function emitActiveCountdown(
  state: WorkoutRunState,
  nowMs: number,
): RunTransition {
  const step = getCurrentStep(state);
  const stepStartedAtMs = state.stepStartedAtMs;
  if (stepStartedAtMs === null || step.goal.type !== "TIME") {
    return {
      state: { ...state, lastObservedAtMs: nowMs },
      events: [],
    };
  }

  let purpose: CountdownPurpose | null = null;
  if (step.kind === "WORK" && state.countdown.endSetCountdownEnabled) {
    purpose = "END_WORK";
  } else if (
    step.kind === "RECOVERY" &&
    state.countdown.nextSetCountdownEnabled &&
    state.timeline[state.stepIndex + 1]?.kind === "WORK"
  ) {
    purpose = "BEFORE_NEXT_WORK";
  }

  if (purpose === null) {
    return {
      state: { ...state, lastObservedAtMs: nowMs },
      events: [],
    };
  }

  const endAtMs = stepStartedAtMs + step.goal.durationMs;
  const remainingMs = endAtMs - nowMs;
  const number = getCountdownNumber(
    remainingMs,
    state.countdown.durationSeconds,
    state.lastCountdownNumber,
  );

  if (number === null) {
    return {
      state: { ...state, lastObservedAtMs: nowMs },
      events: [],
    };
  }

  const scheduledAtMs = Math.max(
    stepStartedAtMs,
    endAtMs - number * 1000,
  );
  const highestPossibleNumber = Math.min(
    state.countdown.durationSeconds,
    Math.ceil(step.goal.durationMs / 1000),
  );
  const skippedEvents = createSkippedCountdownEvents(
    purpose,
    state.lastCountdownNumber,
    highestPossibleNumber,
    number,
    stepStartedAtMs,
    endAtMs,
  );

  return {
    state: {
      ...state,
      lastCountdownNumber: number,
      lastObservedAtMs: nowMs,
    },
    events: [
      ...skippedEvents,
      {
        type: "COUNTDOWN_NUMBER",
        purpose,
        number,
        scheduledAtMs,
        audible: canPlayAt(nowMs, scheduledAtMs),
      },
    ],
  };
}

function completeCurrentStep(
  state: WorkoutRunState,
  atMs: number,
  observedAtMs: number,
): RunTransition {
  const step = getCurrentStep(state);
  const stepStartedAtMs = state.stepStartedAtMs;
  if (stepStartedAtMs === null) {
    throw new Error("Cannot complete a step that has not started.");
  }

  const actualElapsedMs =
    step.goal.type === "TIME"
      ? step.goal.durationMs
      : Math.max(0, atMs - stepStartedAtMs);
  const nextStep = state.timeline[state.stepIndex + 1];
  const cueIsCurrent = canPlayAt(observedAtMs, atMs);
  const events: WorkoutRunEvent[] = [];
  let countdownPurpose: CountdownPurpose | null = null;

  if (step.kind === "WORK" && state.countdown.endSetCountdownEnabled) {
    countdownPurpose = "END_WORK";
  } else if (
    step.kind === "RECOVERY" &&
    nextStep?.kind === "WORK" &&
    state.countdown.nextSetCountdownEnabled
  ) {
    countdownPurpose = "BEFORE_NEXT_WORK";
  }

  if (countdownPurpose !== null && step.goal.type === "TIME") {
    const highestPossibleNumber = Math.min(
      state.countdown.durationSeconds,
      Math.ceil(step.goal.durationMs / 1000),
    );
    events.push(
      ...createSkippedCountdownEvents(
        countdownPurpose,
        state.lastCountdownNumber,
        highestPossibleNumber,
        0,
        stepStartedAtMs,
        stepStartedAtMs + step.goal.durationMs,
      ),
    );
  }

  if (step.kind === "WORK" && state.countdown.endSetCountdownEnabled) {
    events.push({
      type: "COUNTDOWN_END",
      scheduledAtMs: atMs,
      audible: cueIsCurrent,
    });
    if (!cueIsCurrent) {
      events.push({
        type: "CUE_SKIPPED",
        purpose: "END_WORK",
        scheduledAtMs: atMs,
        reason: "STALE",
      });
    }
  }

  events.push({
    type: "STEP_COMPLETED",
    step,
    atMs,
    actualElapsedMs,
    actualDistanceM: state.stepDistanceM,
  });

  if (step.kind === "WORK") {
    events.push({
      type: "WORK_SET_COMPLETED",
      step,
      atMs,
      audible: cueIsCurrent,
    });
    if (!cueIsCurrent) {
      events.push({
        type: "CUE_SKIPPED",
        purpose: "WORK_SET_COMPLETION",
        scheduledAtMs: atMs,
        reason: "STALE",
      });
    }
  }

  if (
    step.kind === "RECOVERY" &&
    nextStep?.kind === "WORK" &&
    state.countdown.nextSetCountdownEnabled
  ) {
    events.push({
      type: "COUNTDOWN_GO",
      purpose: "NEXT_WORK",
      scheduledAtMs: atMs,
      audible: cueIsCurrent,
    });
    if (!cueIsCurrent) {
      events.push({
        type: "CUE_SKIPPED",
        purpose: "NEXT_WORK",
        scheduledAtMs: atMs,
        reason: "STALE",
      });
    }
  }

  if (!nextStep) {
    const activeStartedAtMs = state.activeStartedAtMs;
    if (activeStartedAtMs === null) {
      throw new Error("Cannot complete a workout that has not started.");
    }
    const finalElapsedMs = Math.max(
      0,
      atMs - activeStartedAtMs - state.totalPausedMs,
    );
    events.push({ type: "WORKOUT_COMPLETED", atMs });
    return {
      state: {
        ...state,
        status: "COMPLETED",
        stepIndex: state.timeline.length,
        stepStartedAtMs: null,
        stepDistanceM: null,
        lastCountdownNumber: null,
        lastObservedAtMs: observedAtMs,
        finalElapsedMs,
      },
      events,
    };
  }

  events.push({ type: "STEP_STARTED", step: nextStep, atMs });
  return {
    state: {
      ...state,
      status: getActiveStatus(nextStep),
      stepIndex: state.stepIndex + 1,
      stepStartedAtMs: atMs,
      stepDistanceM: null,
      lastCountdownNumber: null,
      lastObservedAtMs: observedAtMs,
    },
    events,
  };
}

function advanceActive(
  state: WorkoutRunState,
  nowMs: number,
): RunTransition {
  let current = state;
  const events: WorkoutRunEvent[] = [];

  while (isActiveRunStatus(current.status)) {
    if (current.stepIndex >= current.timeline.length) {
      throw new Error("Active run has no current step.");
    }

    const step = getCurrentStep(current);
    const stepStartedAtMs = current.stepStartedAtMs;
    if (stepStartedAtMs === null) {
      throw new Error("Active run step has no start timestamp.");
    }

    if (step.goal.type === "DISTANCE") {
      return {
        state: { ...current, lastObservedAtMs: nowMs },
        events,
      };
    }

    const endAtMs = stepStartedAtMs + step.goal.durationMs;
    if (nowMs < endAtMs) {
      const countdown = emitActiveCountdown(current, nowMs);
      return {
        state: countdown.state,
        events: [...events, ...countdown.events],
      };
    }

    const completed = completeCurrentStep(current, endAtMs, nowMs);
    events.push(...completed.events);
    current = completed.state;

    if (current.status === "COMPLETED") {
      return { state: current, events };
    }
  }

  return { state: { ...current, lastObservedAtMs: nowMs }, events };
}

export function createWorkoutRunState(
  timeline: WorkoutRunState["timeline"],
  countdown: WorkoutRunState["countdown"] = DEFAULT_COUNTDOWN_PREFERENCES,
): WorkoutRunState {
  if (timeline.length === 0) {
    throw new RangeError("A workout run requires at least one timeline step.");
  }
  validateCountdownPreferences(countdown);

  return {
    timeline,
    countdown,
    status: "READY",
    stepIndex: 0,
    stepStartedAtMs: null,
    prestartStartedAtMs: null,
    activeStartedAtMs: null,
    pausedAtMs: null,
    pausedFromStatus: null,
    totalPausedMs: 0,
    stepDistanceM: null,
    lastCountdownNumber: null,
    lastObservedAtMs: null,
    finalElapsedMs: null,
  };
}

export function startWorkoutRun(
  state: WorkoutRunState,
  nowMs: number,
): RunTransition {
  assertTimestamp(nowMs);
  if (state.status !== "READY") {
    throw new Error(`Cannot start a workout in ${state.status} state.`);
  }

  if (state.countdown.startCountdownEnabled) {
    const durationSeconds = state.countdown.durationSeconds;
    return {
      state: {
        ...state,
        status: "PRESTART",
        prestartStartedAtMs: nowMs,
        lastCountdownNumber: durationSeconds,
        lastObservedAtMs: nowMs,
      },
      events: [
        {
          type: "COUNTDOWN_NUMBER",
          purpose: "PRESTART",
          number: durationSeconds,
          scheduledAtMs: nowMs,
          audible: true,
        },
      ],
    };
  }

  const started = startStep(
    {
      ...state,
      activeStartedAtMs: nowMs,
    },
    0,
    nowMs,
  );
  return started;
}

export function advanceWorkoutRun(
  state: WorkoutRunState,
  nowMs: number,
): RunTransition {
  assertNotBeforeLastObservation(state, nowMs);

  if (state.status === "PRESTART") {
    const prestartStartedAtMs = state.prestartStartedAtMs;
    if (prestartStartedAtMs === null) {
      throw new Error("Pre-start countdown has no start timestamp.");
    }
    const endAtMs =
      prestartStartedAtMs + state.countdown.durationSeconds * 1000;

    if (nowMs >= endAtMs) {
      const started = startStep(
        {
          ...state,
          activeStartedAtMs: endAtMs,
          lastObservedAtMs: endAtMs,
        },
        0,
        endAtMs,
      );
      const goIsCurrent = canPlayAt(nowMs, endAtMs);
      const goEvent: WorkoutRunEvent = {
        type: "COUNTDOWN_GO",
        purpose: "START",
        scheduledAtMs: endAtMs,
        audible: goIsCurrent,
      };
      const skippedGoEvent: WorkoutRunEvent | null = goIsCurrent
        ? null
        : {
            type: "CUE_SKIPPED",
            purpose: "START",
            scheduledAtMs: endAtMs,
            reason: "STALE",
          };
      const advanced = advanceActive(started.state, nowMs);
      const skippedEvents = createSkippedCountdownEvents(
        "PRESTART",
        state.lastCountdownNumber,
        state.countdown.durationSeconds,
        0,
        prestartStartedAtMs,
        endAtMs,
      );
      return {
        state: advanced.state,
        events: [
          ...skippedEvents,
          goEvent,
          ...(skippedGoEvent === null ? [] : [skippedGoEvent]),
          ...started.events,
          ...advanced.events,
        ],
      };
    }

    const number = getCountdownNumber(
      endAtMs - nowMs,
      state.countdown.durationSeconds,
      state.lastCountdownNumber,
    );
    const skippedEvents =
      number === null
        ? []
        : createSkippedCountdownEvents(
            "PRESTART",
            state.lastCountdownNumber,
            state.countdown.durationSeconds,
            number,
            prestartStartedAtMs,
            endAtMs,
          );

    return {
      state: {
        ...state,
        lastCountdownNumber: number ?? state.lastCountdownNumber,
        lastObservedAtMs: nowMs,
      },
      events:
        number === null
          ? []
          : [
              ...skippedEvents,
              {
                type: "COUNTDOWN_NUMBER",
                purpose: "PRESTART",
                number,
                scheduledAtMs: endAtMs - number * 1000,
                audible: canPlayAt(
                  nowMs,
                  endAtMs - number * 1000,
                ),
              },
            ],
    };
  }

  if (isActiveRunStatus(state.status)) {
    return advanceActive(state, nowMs);
  }

  return { state, events: [] };
}

export function pauseWorkoutRun(
  state: WorkoutRunState,
  nowMs: number,
): RunTransition {
  const advanced = advanceWorkoutRun(state, nowMs);
  if (
    advanced.state.status !== "PRESTART" &&
    !isActiveRunStatus(advanced.state.status)
  ) {
    return advanced;
  }

  return {
    state: {
      ...advanced.state,
      status: "PAUSED",
      pausedAtMs: nowMs,
      pausedFromStatus: advanced.state.status,
      lastObservedAtMs: nowMs,
    },
    events: advanced.events,
  };
}

export function resumeWorkoutRun(
  state: WorkoutRunState,
  nowMs: number,
): RunTransition {
  assertNotBeforeLastObservation(state, nowMs);
  if (state.status !== "PAUSED" || state.pausedAtMs === null) {
    throw new Error(`Cannot resume a workout in ${state.status} state.`);
  }

  const pauseDurationMs = nowMs - state.pausedAtMs;
  const pausedFromStatus = state.pausedFromStatus;
  if (pausedFromStatus === null) {
    throw new Error("Paused workout has no prior state.");
  }

  const resumed: WorkoutRunState = {
    ...state,
    status: pausedFromStatus,
    prestartStartedAtMs:
      pausedFromStatus === "PRESTART" && state.prestartStartedAtMs !== null
        ? state.prestartStartedAtMs + pauseDurationMs
        : state.prestartStartedAtMs,
    stepStartedAtMs:
      pausedFromStatus !== "PRESTART" && state.stepStartedAtMs !== null
        ? state.stepStartedAtMs + pauseDurationMs
        : state.stepStartedAtMs,
    pausedAtMs: null,
    pausedFromStatus: null,
    totalPausedMs:
      state.totalPausedMs +
      (isActiveRunStatus(pausedFromStatus) ? pauseDurationMs : 0),
    lastObservedAtMs: nowMs,
  };

  return advanceWorkoutRun(resumed, nowMs);
}

export function reportStepDistance(
  state: WorkoutRunState,
  cumulativeDistanceM: number,
  nowMs: number,
): RunTransition {
  if (!Number.isFinite(cumulativeDistanceM) || cumulativeDistanceM < 0) {
    throw new RangeError("Step distance must be finite and non-negative.");
  }

  const advanced = advanceWorkoutRun(state, nowMs);
  if (!isActiveRunStatus(advanced.state.status)) {
    throw new Error("Distance progress requires an active workout.");
  }

  const step = getCurrentStep(advanced.state);
  const previousDistanceM = advanced.state.stepDistanceM;
  if (previousDistanceM !== null && cumulativeDistanceM < previousDistanceM) {
    throw new RangeError("Step distance must not move backwards.");
  }

  const updated: WorkoutRunState = {
    ...advanced.state,
    stepDistanceM: cumulativeDistanceM,
  };
  if (step.goal.type === "TIME") {
    return { state: updated, events: advanced.events };
  }
  if (cumulativeDistanceM < step.goal.distanceM) {
    if (cumulativeDistanceM === previousDistanceM) {
      return { state: updated, events: advanced.events };
    }
    return {
      state: updated,
      events: [
        ...advanced.events,
        {
          type: "DISTANCE_PROGRESS",
          step,
          remainingDistanceM: step.goal.distanceM - cumulativeDistanceM,
          atMs: nowMs,
        },
      ],
    };
  }

  const completed = completeCurrentStep(
    updated,
    nowMs,
    nowMs,
  );
  const next = advanceWorkoutRun(completed.state, nowMs);
  return {
    state: next.state,
    events: [
      ...advanced.events,
      {
        type: "DISTANCE_PROGRESS",
        step,
        remainingDistanceM: 0,
        atMs: nowMs,
      },
      ...completed.events,
      ...next.events,
    ],
  };
}

export function abortWorkoutRun(
  state: WorkoutRunState,
  nowMs: number,
): RunTransition {
  assertNotBeforeLastObservation(state, nowMs);
  const advanced =
    state.status === "PAUSED"
      ? { state, events: [] as const }
      : advanceWorkoutRun(state, nowMs);

  if (
    advanced.state.status === "COMPLETED" ||
    advanced.state.status === "ABORTED"
  ) {
    return advanced;
  }

  const elapsedMs = getSessionElapsedMs(advanced.state, nowMs);
  return {
    state: {
      ...advanced.state,
      status: "ABORTED",
      stepStartedAtMs: null,
      prestartStartedAtMs: null,
      pausedAtMs: null,
      pausedFromStatus: null,
      finalElapsedMs: elapsedMs,
      lastObservedAtMs: nowMs,
    },
    events: [
      ...advanced.events,
      { type: "WORKOUT_ABORTED", atMs: nowMs },
    ],
  };
}

export function getSessionElapsedMs(
  state: WorkoutRunState,
  nowMs: number,
): number {
  assertTimestamp(nowMs);
  if (
    state.status === "READY" ||
    state.status === "PRESTART" ||
    state.activeStartedAtMs === null
  ) {
    return 0;
  }
  if (state.finalElapsedMs !== null) {
    return state.finalElapsedMs;
  }

  const effectiveNowMs =
    state.status === "PAUSED" && state.pausedAtMs !== null
      ? state.pausedAtMs
      : nowMs;
  return Math.max(
    0,
    effectiveNowMs - state.activeStartedAtMs - state.totalPausedMs,
  );
}
