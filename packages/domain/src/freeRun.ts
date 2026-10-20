export type FreeRunStatus = "READY" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ABORTED";

export interface FreeRunState {
  readonly status: FreeRunStatus;
  readonly activeStartedAtMs: number | null;
  readonly pausedAtMs: number | null;
  readonly totalPausedMs: number;
  readonly finalElapsedMs: number | null;
  readonly lastObservedAtMs: number | null;
}

function assertTimestamp(nowMs: number): void {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new RangeError("Monotonic timestamps must be finite and non-negative.");
  }
}

function assertMonotonic(state: FreeRunState, nowMs: number): void {
  assertTimestamp(nowMs);
  if (state.lastObservedAtMs !== null && nowMs < state.lastObservedAtMs) {
    throw new RangeError("Run timestamps must be monotonically non-decreasing.");
  }
}

export function createFreeRunState(): FreeRunState {
  return {
    status: "READY",
    activeStartedAtMs: null,
    pausedAtMs: null,
    totalPausedMs: 0,
    finalElapsedMs: null,
    lastObservedAtMs: null,
  };
}

export function startFreeRun(state: FreeRunState, nowMs: number): FreeRunState {
  assertMonotonic(state, nowMs);
  if (state.status !== "READY") {
    throw new Error(`Cannot start a Free Run in ${state.status} state.`);
  }
  return {
    ...state,
    status: "ACTIVE",
    activeStartedAtMs: nowMs,
    lastObservedAtMs: nowMs,
  };
}

export function observeFreeRun(state: FreeRunState, nowMs: number): FreeRunState {
  assertMonotonic(state, nowMs);
  if (state.status !== "ACTIVE") {
    return state;
  }
  return { ...state, lastObservedAtMs: nowMs };
}

export function pauseFreeRun(state: FreeRunState, nowMs: number): FreeRunState {
  const observed = observeFreeRun(state, nowMs);
  if (observed.status !== "ACTIVE") {
    throw new Error(`Cannot pause a Free Run in ${observed.status} state.`);
  }
  return {
    ...observed,
    status: "PAUSED",
    pausedAtMs: nowMs,
  };
}

export function resumeFreeRun(state: FreeRunState, nowMs: number): FreeRunState {
  assertMonotonic(state, nowMs);
  if (state.status !== "PAUSED" || state.pausedAtMs === null) {
    throw new Error(`Cannot resume a Free Run in ${state.status} state.`);
  }
  return {
    ...state,
    status: "ACTIVE",
    totalPausedMs: state.totalPausedMs + (nowMs - state.pausedAtMs),
    pausedAtMs: null,
    lastObservedAtMs: nowMs,
  };
}

export function getFreeRunElapsedMs(state: FreeRunState, nowMs: number): number {
  assertTimestamp(nowMs);
  if (state.activeStartedAtMs === null) {
    return 0;
  }
  if (state.finalElapsedMs !== null) {
    return state.finalElapsedMs;
  }
  const effectiveNow = state.status === "PAUSED" && state.pausedAtMs !== null
    ? state.pausedAtMs
    : nowMs;
  return Math.max(0, effectiveNow - state.activeStartedAtMs - state.totalPausedMs);
}

function endFreeRun(
  state: FreeRunState,
  nowMs: number,
  status: "COMPLETED" | "ABORTED",
): FreeRunState {
  assertMonotonic(state, nowMs);
  if (state.status !== "ACTIVE" && state.status !== "PAUSED") {
    throw new Error(`Cannot end a Free Run in ${state.status} state.`);
  }
  return {
    ...state,
    status,
    finalElapsedMs: getFreeRunElapsedMs(state, nowMs),
    pausedAtMs: null,
    lastObservedAtMs: nowMs,
  };
}

export function finishFreeRun(state: FreeRunState, nowMs: number): FreeRunState {
  return endFreeRun(state, nowMs, "COMPLETED");
}

export function abortFreeRun(state: FreeRunState, nowMs: number): FreeRunState {
  return endFreeRun(state, nowMs, "ABORTED");
}
