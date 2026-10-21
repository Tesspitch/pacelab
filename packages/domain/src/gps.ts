const EARTH_RADIUS_M = 6_371_008.8;

export interface GpsSample {
  readonly timestampMs: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly horizontalAccuracyM: number;
  readonly altitudeM?: number | null;
  readonly verticalAccuracyM?: number | null;
}

export type GpsPointQuality =
  | 'ANCHOR'
  | 'ACCEPTED'
  | 'GAP_ANCHOR'
  | 'IGNORED_INVALID'
  | 'IGNORED_LOW_ACCURACY'
  | 'IGNORED_OUT_OF_ORDER'
  | 'IGNORED_JITTER'
  | 'IGNORED_IMPLAUSIBLE_JUMP';

export interface ValidatedGpsPoint extends GpsSample {
  readonly quality: GpsPointQuality;
  readonly cumulativeDistanceM: number;
}

export interface CompletedKilometerLap {
  readonly lapIndex: number;
  readonly startDistanceM: number;
  readonly endDistanceM: number;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly durationMs: number;
  readonly averagePaceSecondsPerKm: number;
}

export interface GpsTrackerConfig {
  readonly maximumHorizontalAccuracyM: number;
  readonly maximumGapMs: number;
  readonly maximumRunningSpeedMps: number;
  readonly minimumPaceWindowMs: number;
  readonly minimumPaceWindowDistanceM: number;
  readonly paceWindowMs: number;
}

export interface GpsTrackerState {
  readonly config: GpsTrackerConfig;
  readonly startedAtMs: number | null;
  readonly lastAcceptedPoint: ValidatedGpsPoint | null;
  readonly cumulativeDistanceM: number;
  readonly currentPaceSecondsPerKm: number | null;
  readonly paceWindow: readonly ValidatedGpsPoint[];
  readonly completedLaps: readonly CompletedKilometerLap[];
}

export interface GpsSampleResult {
  readonly state: GpsTrackerState;
  readonly point: ValidatedGpsPoint;
  readonly distanceDeltaM: number;
  readonly completedLaps: readonly CompletedKilometerLap[];
}

export const defaultGpsTrackerConfig: GpsTrackerConfig = {
  maximumHorizontalAccuracyM: 50,
  maximumGapMs: 30_000,
  maximumRunningSpeedMps: 12,
  minimumPaceWindowMs: 5_000,
  minimumPaceWindowDistanceM: 15,
  paceWindowMs: 30_000,
};

export function createGpsTrackerState(
  config: Partial<GpsTrackerConfig> = {},
): GpsTrackerState {
  return {
    config: { ...defaultGpsTrackerConfig, ...config },
    startedAtMs: null,
    lastAcceptedPoint: null,
    cumulativeDistanceM: 0,
    currentPaceSecondsPerKm: null,
    paceWindow: [],
    completedLaps: [],
  };
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceBetweenGpsSamplesM(a: GpsSample, b: GpsSample): number {
  const lat1 = degreesToRadians(a.latitude);
  const lat2 = degreesToRadians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = degreesToRadians(b.longitude - a.longitude);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function isFiniteSample(sample: GpsSample): boolean {
  return (
    Number.isFinite(sample.timestampMs) &&
    Number.isFinite(sample.latitude) &&
    Number.isFinite(sample.longitude) &&
    Number.isFinite(sample.horizontalAccuracyM) &&
    sample.latitude >= -90 &&
    sample.latitude <= 90 &&
    sample.longitude >= -180 &&
    sample.longitude <= 180 &&
    sample.horizontalAccuracyM >= 0
  );
}

function rejectedPoint(
  state: GpsTrackerState,
  sample: GpsSample,
  quality: GpsPointQuality,
): GpsSampleResult {
  return {
    state,
    point: { ...sample, quality, cumulativeDistanceM: state.cumulativeDistanceM },
    distanceDeltaM: 0,
    completedLaps: [],
  };
}

function calculatePace(
  points: readonly ValidatedGpsPoint[],
  config: GpsTrackerConfig,
): number | null {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  const elapsedMs = last.timestampMs - first.timestampMs;
  const distanceM = last.cumulativeDistanceM - first.cumulativeDistanceM;
  if (elapsedMs < config.minimumPaceWindowMs || distanceM < config.minimumPaceWindowDistanceM) {
    return null;
  }
  return (elapsedMs / 1000) / (distanceM / 1000);
}

function deriveLaps(
  state: GpsTrackerState,
  previous: ValidatedGpsPoint,
  point: ValidatedGpsPoint,
): readonly CompletedKilometerLap[] {
  if (point.cumulativeDistanceM <= previous.cumulativeDistanceM) return [];
  const laps: CompletedKilometerLap[] = [];
  let lapIndex = state.completedLaps.length + 1;
  let boundaryM = lapIndex * 1000;
  while (boundaryM <= point.cumulativeDistanceM) {
    const fraction =
      (boundaryM - previous.cumulativeDistanceM) /
      (point.cumulativeDistanceM - previous.cumulativeDistanceM);
    const endedAtMs = previous.timestampMs + fraction * (point.timestampMs - previous.timestampMs);
    const startedAtMs = state.completedLaps.at(-1)?.endedAtMs ?? state.startedAtMs ?? previous.timestampMs;
    const durationMs = Math.max(0, endedAtMs - startedAtMs);
    laps.push({
      lapIndex,
      startDistanceM: boundaryM - 1000,
      endDistanceM: boundaryM,
      startedAtMs,
      endedAtMs,
      durationMs,
      averagePaceSecondsPerKm: durationMs / 1000,
    });
    lapIndex += 1;
    boundaryM = lapIndex * 1000;
  }
  return laps;
}

export function addGpsSample(state: GpsTrackerState, sample: GpsSample): GpsSampleResult {
  if (!isFiniteSample(sample)) return rejectedPoint(state, sample, 'IGNORED_INVALID');
  if (sample.horizontalAccuracyM > state.config.maximumHorizontalAccuracyM) {
    return rejectedPoint(state, sample, 'IGNORED_LOW_ACCURACY');
  }

  const previous = state.lastAcceptedPoint;
  if (!previous) {
    const point: ValidatedGpsPoint = {
      ...sample,
      quality: 'ANCHOR',
      cumulativeDistanceM: 0,
    };
    return {
      state: {
        ...state,
        startedAtMs: sample.timestampMs,
        lastAcceptedPoint: point,
        paceWindow: [point],
      },
      point,
      distanceDeltaM: 0,
      completedLaps: [],
    };
  }

  const elapsedMs = sample.timestampMs - previous.timestampMs;
  if (elapsedMs <= 0) return rejectedPoint(state, sample, 'IGNORED_OUT_OF_ORDER');
  if (elapsedMs > state.config.maximumGapMs) {
    const point: ValidatedGpsPoint = {
      ...sample,
      quality: 'GAP_ANCHOR',
      cumulativeDistanceM: state.cumulativeDistanceM,
    };
    return {
      state: {
        ...state,
        lastAcceptedPoint: point,
        currentPaceSecondsPerKm: null,
        paceWindow: [point],
      },
      point,
      distanceDeltaM: 0,
      completedLaps: [],
    };
  }

  const rawDistanceM = distanceBetweenGpsSamplesM(previous, sample);
  const speedMps = rawDistanceM / (elapsedMs / 1000);
  if (speedMps > state.config.maximumRunningSpeedMps) {
    return rejectedPoint(state, sample, 'IGNORED_IMPLAUSIBLE_JUMP');
  }

  const jitterThresholdM = Math.max(
    2,
    Math.min(previous.horizontalAccuracyM, sample.horizontalAccuracyM) * 0.5,
  );
  if (rawDistanceM < jitterThresholdM) {
    return rejectedPoint(state, sample, 'IGNORED_JITTER');
  }

  const cumulativeDistanceM = state.cumulativeDistanceM + rawDistanceM;
  const point: ValidatedGpsPoint = {
    ...sample,
    quality: 'ACCEPTED',
    cumulativeDistanceM,
  };
  const cutoffMs = sample.timestampMs - state.config.paceWindowMs;
  const paceWindow = [...state.paceWindow.filter((item) => item.timestampMs >= cutoffMs), point];
  const newLaps = deriveLaps(state, previous, point);
  const nextState: GpsTrackerState = {
    ...state,
    lastAcceptedPoint: point,
    cumulativeDistanceM,
    currentPaceSecondsPerKm: calculatePace(paceWindow, state.config),
    paceWindow,
    completedLaps: [...state.completedLaps, ...newLaps],
  };
  return { state: nextState, point, distanceDeltaM: rawDistanceM, completedLaps: newLaps };
}

export function getGpsSignalLabel(state: GpsTrackerState): 'WAITING' | 'GOOD' | 'DEGRADED' {
  const quality = state.lastAcceptedPoint?.quality;
  if (!quality) return 'WAITING';
  return quality === 'GAP_ANCHOR' ? 'DEGRADED' : 'GOOD';
}
