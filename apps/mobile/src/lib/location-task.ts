import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { getActiveLocationSession, ingestGpsSample } from '@/lib/database';
import { BACKGROUND_LOCATION_TASK, locationObjectToGpsSample } from '@/lib/location-service';

interface BackgroundLocationData {
  locations: LocationObject[];
}

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask<BackgroundLocationData>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.warn('[PaceLab location task]', error.message);
      return;
    }
    const sessionId = await getActiveLocationSession();
    if (!sessionId || !data?.locations) return;
    for (const location of data.locations) {
      await ingestGpsSample({
        sessionId,
        sample: locationObjectToGpsSample(location),
        source: 'background',
      });
    }
  });
}
