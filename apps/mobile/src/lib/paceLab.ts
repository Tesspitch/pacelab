import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import * as SQLite from 'expo-sqlite';

import {
  abortWorkoutRun,
  advanceWorkoutRun,
  createWorkoutRunState,
  expandWorkoutTimeline,
  pauseWorkoutRun,
  resumeWorkoutRun,
  startWorkoutRun,
  type RunStatus,
  type WorkoutDefinition,
  type WorkoutRunEvent,
  type WorkoutRunState,
} from '@pacelab/domain';

export type LocationPoint = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
};

export const sampleWorkout: WorkoutDefinition = {
  id: 'default-six-by-three',
  name: '6 x 3:00 + 2:00 recovery',
  warmup: {
    id: 'warmup-1',
    kind: 'WARMUP',
    goal: { type: 'TIME', durationMs: 600000 },
  },
  blocks: [{
    id: 'main-block',
    repeatCount: 6,
    workSteps: [{
      id: 'work-1',
      kind: 'WORK',
      goal: { type: 'TIME', durationMs: 180000 },
    }],
    recovery: {
      id: 'recovery-1',
      kind: 'RECOVERY',
      goal: { type: 'TIME', durationMs: 120000 },
    },
    recoveryAfterLastRepetition: false,
  }],
  cooldown: {
    id: 'cooldown-1',
    kind: 'COOLDOWN',
    goal: { type: 'TIME', durationMs: 600000 },
  },
};

export function buildInitialRunState(): WorkoutRunState {
  return createWorkoutRunState(expandWorkoutTimeline(sampleWorkout));
}

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function watchLocation(
  onUpdate: (point: LocationPoint) => void,
): Promise<{ stop: () => void }> {
  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 5,
    },
    (location) => {
      onUpdate({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy ?? null,
        timestamp: location.timestamp,
      });
    },
  );

  return {
    stop: () => {
      subscription.remove();
    },
  };
}

export function speakCue(event: WorkoutRunEvent): void {
  if (event.type === 'COUNTDOWN_NUMBER') {
    Speech.speak(String(event.number));
    return;
  }

  if (event.type === 'COUNTDOWN_GO') {
    Speech.speak(event.purpose === 'NEXT_WORK' ? 'Next work' : 'Go');
    return;
  }

  if (event.type === 'WORK_SET_COMPLETED') {
    Speech.speak('Work set complete');
    return;
  }

  if (event.type === 'STEP_STARTED' && event.step.kind === 'WORK') {
    Speech.speak('Work');
  }
}

export function getRunStatusText(status: RunStatus): string {
  switch (status) {
    case 'READY':
      return 'Ready';
    case 'PRESTART':
      return 'Pre-start';
    case 'ACTIVE_WARMUP':
      return 'Warm-up';
    case 'ACTIVE_WORK':
      return 'Work';
    case 'ACTIVE_RECOVERY':
      return 'Recovery';
    case 'ACTIVE_COOLDOWN':
      return 'Cool-down';
    case 'PAUSED':
      return 'Paused';
    case 'COMPLETED':
      return 'Completed';
    case 'ABORTED':
      return 'Aborted';
    default:
      return status;
  }
}

export function formatMilliseconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function openPaceLabDb(): SQLite.SQLiteDatabase {
  return SQLite.openDatabaseSync('pace_lab.db');
}

export function createRunTableIfNeeded(db: SQLite.SQLiteDatabase): void {
  db.execSync(`CREATE TABLE IF NOT EXISTS pace_lab_runs (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    elapsed_ms INTEGER NOT NULL,
    distance_m REAL NOT NULL DEFAULT 0,
    summary_json TEXT NOT NULL DEFAULT '{}'
  );`);
}

export function insertRunRecord(
  db: SQLite.SQLiteDatabase,
  state: WorkoutRunState,
  nowMs: number,
): void {
  const elapsedMs = Math.max(0, Math.round(nowMs));
  const rowId = `session-${Date.now()}`;
  const payload = JSON.stringify({
    status: state.status,
    stepIndex: state.stepIndex,
    totalPausedMs: state.totalPausedMs,
  });

  db.runSync(
    `INSERT INTO pace_lab_runs (id, mode, status, started_at, completed_at, elapsed_ms, distance_m, summary_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rowId,
      'speedwork',
      state.status,
      new Date().toISOString(),
      new Date().toISOString(),
      elapsedMs,
      0,
      payload,
    ],
  );
}

export function applyWorkoutTransition(
  current: WorkoutRunState,
  action: 'start' | 'pause' | 'resume' | 'advance' | 'abort',
): WorkoutRunState {
  const nowMs = performance.now();

  switch (action) {
    case 'start':
      return startWorkoutRun(current, nowMs).state;
    case 'pause':
      return pauseWorkoutRun(current, nowMs).state;
    case 'resume':
      return resumeWorkoutRun(current, nowMs).state;
    case 'advance':
      return advanceWorkoutRun(current, nowMs).state;
    case 'abort':
      return abortWorkoutRun(current, nowMs).state;
    default:
      return current;
  }
}
