export type DistanceMeters = number;
export type DurationMilliseconds = number;

export type WorkoutStepKind = "WARMUP" | "WORK" | "RECOVERY" | "COOLDOWN";

export type StepGoal =
  | { readonly type: "TIME"; readonly durationMs: DurationMilliseconds }
  | { readonly type: "DISTANCE"; readonly distanceM: DistanceMeters };

export interface PaceTargetRange {
  readonly minSecondsPerKm: number;
  readonly maxSecondsPerKm: number;
}

export interface WorkoutStepDefinition {
  readonly id: string;
  readonly kind: WorkoutStepKind;
  readonly goal: StepGoal;
  readonly targetPace?: PaceTargetRange;
}

export interface WorkoutBlock {
  readonly id: string;
  readonly repeatCount: number;
  readonly workSteps: readonly WorkoutStepDefinition[];
  readonly recovery?: WorkoutStepDefinition;
  readonly recoveryAfterLastRepetition?: boolean;
}

export interface WorkoutDefinition {
  readonly id: string;
  readonly name: string;
  readonly warmup?: WorkoutStepDefinition;
  readonly blocks: readonly WorkoutBlock[];
  readonly cooldown?: WorkoutStepDefinition;
}

export interface ExpandedWorkoutStep extends WorkoutStepDefinition {
  readonly executionId: string;
  readonly sequence: number;
  readonly blockId?: string;
  readonly repetition?: number;
}

export interface CountdownPreferences {
  readonly durationSeconds: 3 | 5 | 10;
  readonly startCountdownEnabled: boolean;
  readonly endSetCountdownEnabled: boolean;
  readonly nextSetCountdownEnabled: boolean;
}

export type ActiveRunStatus =
  | "ACTIVE_WARMUP"
  | "ACTIVE_WORK"
  | "ACTIVE_RECOVERY"
  | "ACTIVE_COOLDOWN";

export type RunStatus =
  | "READY"
  | "PRESTART"
  | ActiveRunStatus
  | "PAUSED"
  | "COMPLETED"
  | "ABORTED";

export type CountdownPurpose = "PRESTART" | "END_WORK" | "BEFORE_NEXT_WORK";
export type SkippedCuePurpose =
  | CountdownPurpose
  | "START"
  | "NEXT_WORK"
  | "WORK_SET_COMPLETION";

export type WorkoutRunEvent =
  | {
      readonly type: "CUE_SKIPPED";
      readonly purpose: SkippedCuePurpose;
      readonly number?: number;
      readonly scheduledAtMs: number;
      readonly reason: "STALE";
    }
  | {
      readonly type: "COUNTDOWN_NUMBER";
      readonly purpose: CountdownPurpose;
      readonly number: number;
      readonly scheduledAtMs: number;
      readonly audible: boolean;
    }
  | {
      readonly type: "COUNTDOWN_GO";
      readonly purpose: "START" | "NEXT_WORK";
      readonly scheduledAtMs: number;
      readonly audible: boolean;
    }
  | {
      readonly type: "COUNTDOWN_END";
      readonly scheduledAtMs: number;
      readonly audible: boolean;
    }
  | {
      readonly type: "STEP_STARTED";
      readonly step: ExpandedWorkoutStep;
      readonly atMs: number;
    }
  | {
      readonly type: "STEP_COMPLETED";
      readonly step: ExpandedWorkoutStep;
      readonly atMs: number;
      readonly actualElapsedMs: number;
      readonly actualDistanceM: DistanceMeters | null;
    }
  | {
      readonly type: "DISTANCE_PROGRESS";
      readonly step: ExpandedWorkoutStep;
      readonly remainingDistanceM: DistanceMeters;
      readonly atMs: number;
    }
  | {
      readonly type: "WORK_SET_COMPLETED";
      readonly step: ExpandedWorkoutStep;
      readonly atMs: number;
      readonly audible: boolean;
    }
  | { readonly type: "WORKOUT_COMPLETED"; readonly atMs: number }
  | { readonly type: "WORKOUT_ABORTED"; readonly atMs: number };

export interface WorkoutRunState {
  readonly timeline: readonly ExpandedWorkoutStep[];
  readonly countdown: CountdownPreferences;
  readonly status: RunStatus;
  readonly stepIndex: number;
  readonly stepStartedAtMs: number | null;
  readonly prestartStartedAtMs: number | null;
  readonly activeStartedAtMs: number | null;
  readonly pausedAtMs: number | null;
  readonly pausedFromStatus: "PRESTART" | ActiveRunStatus | null;
  readonly totalPausedMs: number;
  readonly stepDistanceM: DistanceMeters | null;
  readonly lastCountdownNumber: number | null;
  readonly lastObservedAtMs: number | null;
  readonly finalElapsedMs: number | null;
}

export interface RunTransition {
  readonly state: WorkoutRunState;
  readonly events: readonly WorkoutRunEvent[];
}
