import * as Speech from 'expo-speech';

import type { WorkoutRunEvent } from '@pacelab/domain';

type QueuedCue = { key: string; text: string };

class WorkoutCueQueue {
  private delivered = new Set<string>();
  private pending: QueuedCue[] = [];
  private speaking = false;

  enqueue(events: readonly WorkoutRunEvent[]): void {
    for (const event of events) {
      if ('audible' in event && !event.audible) continue;
      const cue = this.toCue(event, events);
      if (cue === null || this.delivered.has(cue.key)) continue;
      this.delivered.add(cue.key);
      this.pending.push(cue);
    }
    this.playNext();
  }

  cancelPending(): void {
    this.pending = [];
    this.speaking = false;
    void Speech.stop();
  }

  reset(): void {
    this.cancelPending();
    this.delivered.clear();
  }

  private playNext(): void {
    if (this.speaking) return;
    const cue = this.pending.shift();
    if (!cue) return;
    this.speaking = true;
    Speech.speak(cue.text, {
      language: 'en-US',
      rate: 0.95,
      onDone: () => this.completeCue(),
      onError: () => this.completeCue(),
      onStopped: () => this.completeCue(),
    });
  }

  private completeCue(): void {
    this.speaking = false;
    this.playNext();
  }

  private toCue(
    event: WorkoutRunEvent,
    batch: readonly WorkoutRunEvent[],
  ): QueuedCue | null {
    if (event.type === 'COUNTDOWN_NUMBER') {
      return {
        key: `${event.type}:${event.purpose}:${event.number}:${event.scheduledAtMs}`,
        text: String(event.number),
      };
    }
    if (event.type === 'COUNTDOWN_GO') {
      return {
        key: `${event.type}:${event.purpose}:${event.scheduledAtMs}`,
        text: event.purpose === 'NEXT_WORK' ? 'Go. Next work.' : 'Go',
      };
    }
    if (event.type === 'COUNTDOWN_END') {
      return { key: `${event.type}:${event.scheduledAtMs}`, text: 'End' };
    }
    if (event.type === 'STEP_STARTED' && event.step.kind === 'RECOVERY') {
      return { key: `${event.type}:${event.step.executionId}`, text: 'Recovery' };
    }
    if (event.type === 'WORK_SET_COMPLETED') {
      const result = batch.find(
        (candidate): candidate is Extract<WorkoutRunEvent, { type: 'STEP_COMPLETED' }> =>
          candidate.type === 'STEP_COMPLETED' &&
          candidate.step.executionId === event.step.executionId,
      );
      const setNumber = event.step.repetition ?? event.step.sequence + 1;
      const timeSeconds = Math.round((result?.actualElapsedMs ?? 0) / 1000);
      const distance = result?.actualDistanceM;
      const measurement = distance === null || distance === undefined
        ? 'Distance and pace unavailable.'
        : `${Math.round(distance)} meters.`;
      return {
        key: `${event.type}:${event.step.executionId}:${event.atMs}`,
        text: `Work set ${setNumber} complete. ${timeSeconds} seconds. ${measurement}`,
      };
    }
    return null;
  }
}

export const workoutCueQueue = new WorkoutCueQueue();
