import type {
  ExpandedWorkoutStep,
  WorkoutDefinition,
  WorkoutStepDefinition,
} from "./types.js";
import { assertValidWorkout } from "./validation.js";

function expandStep(
  step: WorkoutStepDefinition,
  sequence: number,
  executionId: string,
  blockId?: string,
  repetition?: number,
): ExpandedWorkoutStep {
  return {
    ...step,
    executionId,
    sequence,
    ...(blockId === undefined ? {} : { blockId }),
    ...(repetition === undefined ? {} : { repetition }),
  };
}

export function expandWorkoutTimeline(
  workout: WorkoutDefinition,
): readonly ExpandedWorkoutStep[] {
  assertValidWorkout(workout);

  const steps: ExpandedWorkoutStep[] = [];
  const append = (
    step: WorkoutStepDefinition,
    executionId: string,
    blockId?: string,
    repetition?: number,
  ): void => {
    steps.push(
      expandStep(step, steps.length, executionId, blockId, repetition),
    );
  };

  if (workout.warmup) {
    append(workout.warmup, `warmup:${workout.warmup.id}`);
  }

  for (const block of workout.blocks) {
    for (let repetition = 1; repetition <= block.repeatCount; repetition += 1) {
      for (const workStep of block.workSteps) {
        append(
          workStep,
          `${block.id}:${repetition}:${workStep.id}`,
          block.id,
          repetition,
        );
      }

      if (
        block.recovery &&
        (repetition < block.repeatCount ||
          block.recoveryAfterLastRepetition === true)
      ) {
        append(
          block.recovery,
          `${block.id}:${repetition}:${block.recovery.id}`,
          block.id,
          repetition,
        );
      }
    }
  }

  if (workout.cooldown) {
    append(workout.cooldown, `cooldown:${workout.cooldown.id}`);
  }

  return steps;
}

export function getPlannedDurationMs(
  timeline: readonly ExpandedWorkoutStep[],
): number | null {
  let totalMs = 0;

  for (const step of timeline) {
    if (step.goal.type === "DISTANCE") {
      return null;
    }
    totalMs += step.goal.durationMs;
    if (!Number.isSafeInteger(totalMs)) {
      throw new RangeError("Planned workout duration exceeds safe millisecond precision.");
    }
  }

  return totalMs;
}
