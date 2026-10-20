import type { ExpandedWorkoutStep } from '@pacelab/domain';

export function formatMilliseconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function formatStepGoal(step: ExpandedWorkoutStep): string {
  return step.goal.type === 'TIME'
    ? formatMilliseconds(step.goal.durationMs)
    : `${Math.round(step.goal.distanceM)} m`;
}

export function formatDistance(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(2)} km`;
}
