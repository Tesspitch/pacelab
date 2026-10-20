import {
  expandWorkoutTimeline,
  getPlannedDurationMs,
  type WorkoutDefinition,
} from '@pacelab/domain';

export const sampleWorkout: WorkoutDefinition = {
  id: 'default-six-by-three',
  name: '6 × 3:00 / พัก 2:00',
  warmup: {
    id: 'warmup-1',
    kind: 'WARMUP',
    goal: { type: 'TIME', durationMs: 600_000 },
  },
  blocks: [{
    id: 'main-block',
    repeatCount: 6,
    workSteps: [{
      id: 'work-1',
      kind: 'WORK',
      goal: { type: 'TIME', durationMs: 180_000 },
    }],
    recovery: {
      id: 'recovery-1',
      kind: 'RECOVERY',
      goal: { type: 'TIME', durationMs: 120_000 },
    },
    recoveryAfterLastRepetition: false,
  }],
  cooldown: {
    id: 'cooldown-1',
    kind: 'COOLDOWN',
    goal: { type: 'TIME', durationMs: 600_000 },
  },
};

export const sampleTimeline = expandWorkoutTimeline(sampleWorkout);
export const samplePlannedDurationMs = getPlannedDurationMs(sampleTimeline) ?? 0;
