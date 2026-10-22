import * as Location from 'expo-location';
import { Platform } from 'react-native';
import type { GpsSample, GpsSampleResult } from '@pacelab/domain';

import { ingestGpsSample, setActiveLocationSession } from '@/lib/database';

export const BACKGROUND_LOCATION_TASK = 'pacelab-background-location-v1';

export interface LocationPermissionSnapshot {
  readonly servicesEnabled: boolean;
  readonly foreground: Location.PermissionStatus;
  readonly background: Location.PermissionStatus;
}

export interface LocationTrackingSubscription {
  stop(): Promise<void>;
}

export function locationObjectToGpsSample(location: Location.LocationObject): GpsSample {
  return {
    timestampMs: location.timestamp,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    horizontalAccuracyM: location.coords.accuracy ?? Number.POSITIVE_INFINITY,
    altitudeM: location.coords.altitude,
    verticalAccuracyM: location.coords.altitudeAccuracy,
  };
}

export async function getLocationPermissionSnapshot(): Promise<LocationPermissionSnapshot> {
  const [servicesEnabled, foreground, background] = await Promise.all([
    Location.hasServicesEnabledAsync(),
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  return {
    servicesEnabled,
    foreground: foreground.status,
    background: background.status,
  };
}

export async function requestForegroundLocationPermission(): Promise<Location.PermissionStatus> {
  return (await Location.requestForegroundPermissionsAsync()).status;
}

export async function requestBackgroundLocationPermission(): Promise<Location.PermissionStatus> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) return Location.PermissionStatus.DENIED;
  return (await Location.requestBackgroundPermissionsAsync()).status;
}

export async function startForegroundLocationTracking(
  sessionId: string,
  onResult: (result: GpsSampleResult) => void,
  onError: (message: string) => void,
): Promise<LocationTrackingSubscription> {
  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 500,
      distanceInterval: 1,
      mayShowUserSettingsDialog: true,
    },
    (location) => {
      void ingestGpsSample({
        sessionId,
        sample: locationObjectToGpsSample(location),
        source: 'foreground',
        monotonicMs: performance.now(),
      }).then(onResult).catch((error: unknown) => {
        onError(error instanceof Error ? error.message : 'location persistence failed');
      });
    },
    onError,
  );
  return { stop: async () => subscription.remove() };
}

export async function startBackgroundLocationTracking(sessionId: string): Promise<void> {
  // Background location tasks are native-only. Expo Web can still use the
  // foreground watcher, but must never call the native task API.
  if (Platform.OS === 'web') return;
  await setActiveLocationSession(sessionId);
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) return;
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 500,
    distanceInterval: 1,
    deferredUpdatesDistance: 2,
    deferredUpdatesInterval: 1000,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'PaceLab กำลังบันทึกการวิ่ง',
      notificationBody: 'ตำแหน่งถูกบันทึกไว้ในเครื่องสำหรับกิจกรรมที่กำลังดำเนินอยู่',
      notificationColor: '#5EEAD4',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  if (Platform.OS === 'web') {
    await setActiveLocationSession(null);
    return;
  }
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
  await setActiveLocationSession(null);
}
