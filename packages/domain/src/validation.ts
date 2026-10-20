import type {
  PaceTargetRange,
  WorkoutDefinition,
  WorkoutStepDefinition,
} from "./types";

export interface ValidationIssue {
  readonly path: string;
  readonly code:
    | "EMPTY_ID"
    | "EMPTY_NAME"
    | "NO_BLOCKS"
    | "INVALID_REPEAT_COUNT"
    | "MISSING_WORK_STEPS"
    | "DUPLICATE_ID"
    | "INVALID_STEP_KIND"
    | "INVALID_GOAL"
    | "INVALID_PACE_RANGE"
    | "INVALID_RECOVERY_PLACEMENT";
  readonly message: string;
}

const validStepKinds = new Set(["WARMUP", "WORK", "RECOVERY", "COOLDOWN"]);

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validatePaceRange(
  range: PaceTargetRange,
  path: string,
  issues: ValidationIssue[],
): void {
  if (
    !isPositiveFinite(range.minSecondsPerKm) ||
    !isPositiveFinite(range.maxSecondsPerKm) ||
    range.minSecondsPerKm > range.maxSecondsPerKm
  ) {
    issues.push({
      path,
      code: "INVALID_PACE_RANGE",
      message: "Pace bounds must be positive and min must not exceed max.",
    });
  }
}

function validateStep(
  step: WorkoutStepDefinition,
  expectedKind: WorkoutStepDefinition["kind"],
  path: string,
  seenIds: Set<string>,
  issues: ValidationIssue[],
): void {
  if (step.kind !== expectedKind || !validStepKinds.has(step.kind)) {
    issues.push({
      path: `${path}.kind`,
      code: "INVALID_STEP_KIND",
      message: `Expected a ${expectedKind} step.`,
    });
  }

  if (step.id.trim().length === 0) {
    issues.push({
      path: `${path}.id`,
      code: "EMPTY_ID",
      message: "Step IDs must not be empty.",
    });
  } else if (seenIds.has(step.id)) {
    issues.push({
      path: `${path}.id`,
      code: "DUPLICATE_ID",
      message: `Step ID "${step.id}" is duplicated.`,
    });
  } else {
    seenIds.add(step.id);
  }

  const goalValid =
    step.goal.type === "TIME"
      ? Number.isSafeInteger(step.goal.durationMs) && step.goal.durationMs > 0
      : step.goal.type === "DISTANCE" &&
        isPositiveFinite(step.goal.distanceM);

  if (!goalValid) {
    issues.push({
      path: `${path}.goal`,
      code: "INVALID_GOAL",
      message: "Step goal must be a positive time in milliseconds or distance in meters.",
    });
  }

  if (step.targetPace) {
    validatePaceRange(step.targetPace, `${path}.targetPace`, issues);
  }
}

export function validateWorkout(
  workout: WorkoutDefinition,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenBlockIds = new Set<string>();
  const seenStepIds = new Set<string>();

  if (workout.id.trim().length === 0) {
    issues.push({
      path: "id",
      code: "EMPTY_ID",
      message: "Workout ID must not be empty.",
    });
  }

  if (workout.name.trim().length === 0) {
    issues.push({
      path: "name",
      code: "EMPTY_NAME",
      message: "Workout name must not be empty.",
    });
  }

  if (workout.blocks.length === 0) {
    issues.push({
      path: "blocks",
      code: "NO_BLOCKS",
      message: "A structured workout must contain at least one block.",
    });
  }

  if (workout.warmup) {
    validateStep(workout.warmup, "WARMUP", "warmup", seenStepIds, issues);
  }

  workout.blocks.forEach((block, blockIndex) => {
    const path = `blocks[${blockIndex}]`;

    if (block.id.trim().length === 0) {
      issues.push({
        path: `${path}.id`,
        code: "EMPTY_ID",
        message: "Block IDs must not be empty.",
      });
    } else if (seenBlockIds.has(block.id)) {
      issues.push({
        path: `${path}.id`,
        code: "DUPLICATE_ID",
        message: `Block ID "${block.id}" is duplicated.`,
      });
    } else {
      seenBlockIds.add(block.id);
    }

    if (!Number.isSafeInteger(block.repeatCount) || block.repeatCount < 1) {
      issues.push({
        path: `${path}.repeatCount`,
        code: "INVALID_REPEAT_COUNT",
        message: "Repeat count must be a positive safe integer.",
      });
    }

    if (block.workSteps.length === 0) {
      issues.push({
        path: `${path}.workSteps`,
        code: "MISSING_WORK_STEPS",
        message: "Each block must contain at least one work step.",
      });
    }

    block.workSteps.forEach((step, stepIndex) => {
      validateStep(
        step,
        "WORK",
        `${path}.workSteps[${stepIndex}]`,
        seenStepIds,
        issues,
      );
    });

    if (block.recovery) {
      validateStep(
        block.recovery,
        "RECOVERY",
        `${path}.recovery`,
        seenStepIds,
        issues,
      );
    }

    if (
      block.recoveryAfterLastRepetition !== undefined &&
      typeof block.recoveryAfterLastRepetition !== "boolean"
    ) {
      issues.push({
        path: `${path}.recoveryAfterLastRepetition`,
        code: "INVALID_RECOVERY_PLACEMENT",
        message: "Final recovery placement must be a boolean.",
      });
    }

    if (block.recoveryAfterLastRepetition && !block.recovery) {
      issues.push({
        path: `${path}.recoveryAfterLastRepetition`,
        code: "INVALID_RECOVERY_PLACEMENT",
        message: "A final recovery requires a recovery step.",
      });
    }
  });

  if (workout.cooldown) {
    validateStep(workout.cooldown, "COOLDOWN", "cooldown", seenStepIds, issues);
  }

  return issues;
}

export class WorkoutValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(
      `Workout is invalid: ${issues.map((issue) => issue.message).join(" ")}`,
    );
    this.name = "WorkoutValidationError";
    this.issues = issues;
  }
}

export function assertValidWorkout(
  workout: WorkoutDefinition,
): void {
  const issues = validateWorkout(workout);
  if (issues.length > 0) {
    throw new WorkoutValidationError(issues);
  }
}
