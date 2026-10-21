import { describe, expect, it } from 'vitest';
import {
  addGpsSample,
  createGpsTrackerState,
  distanceBetweenGpsSamplesM,
  type GpsSample,
} from '../src';

const base: GpsSample = {
  timestampMs: 0,
  latitude: 13.7563,
  longitude: 100.5018,
  horizontalAccuracyM: 3,
};

function northOf(sample: GpsSample, distanceM: number, timestampMs: number): GpsSample {
  return {
    ...sample,
    timestampMs,
    latitude: sample.latitude + distanceM / 111_195,
  };
}

describe('GPS validation and metrics', () => {
  it('computes a realistic haversine distance', () => {
    expect(distanceBetweenGpsSamplesM(base, northOf(base, 100, 10_000))).toBeCloseTo(100, 0);
  });

  it('rejects low accuracy, out-of-order points, jitter and implausible jumps', () => {
    const anchor = addGpsSample(createGpsTrackerState(), base).state;
    expect(addGpsSample(anchor, { ...base, timestampMs: 1000, horizontalAccuracyM: 80 }).point.quality)
      .toBe('IGNORED_LOW_ACCURACY');
    expect(addGpsSample(anchor, { ...base, timestampMs: 0 }).point.quality)
      .toBe('IGNORED_OUT_OF_ORDER');
    expect(addGpsSample(anchor, northOf(base, 1, 1000)).point.quality)
      .toBe('IGNORED_JITTER');
    expect(addGpsSample(anchor, northOf(base, 500, 1000)).point.quality)
      .toBe('IGNORED_IMPLAUSIBLE_JUMP');
  });

  it('does not bridge distance across a long GPS outage', () => {
    let state = addGpsSample(createGpsTrackerState(), base).state;
    const result = addGpsSample(state, northOf(base, 200, 31_000));
    expect(result.point.quality).toBe('GAP_ANCHOR');
    expect(result.state.cumulativeDistanceM).toBe(0);
    expect(result.state.currentPaceSecondsPerKm).toBeNull();
  });

  it('smooths current pace over validated movement', () => {
    let state = addGpsSample(createGpsTrackerState(), base).state;
    state = addGpsSample(state, northOf(base, 25, 7_500)).state;
    state = addGpsSample(state, northOf(base, 50, 15_000)).state;
    expect(state.cumulativeDistanceM).toBeCloseTo(50, 0);
    expect(state.currentPaceSecondsPerKm).toBeCloseTo(300, -1);
  });

  it('creates five full kilometer laps and leaves 50m partial for 5,050m', () => {
    let state = addGpsSample(createGpsTrackerState(), base).state;
    let previous = base;
    for (let index = 1; index <= 101; index += 1) {
      const point = northOf(base, index * 50, index * 15_000);
      state = addGpsSample(state, point).state;
      previous = point;
    }
    expect(previous.latitude).toBeGreaterThan(base.latitude);
    expect(state.cumulativeDistanceM).toBeCloseTo(5050, -1);
    expect(state.completedLaps).toHaveLength(5);
    expect(state.completedLaps.map((lap) => lap.lapIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(state.completedLaps.every((lap) => Math.abs(lap.durationMs - 300_000) < 1000)).toBe(true);
  });
});
