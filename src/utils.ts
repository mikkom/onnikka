import { RELIABLE_SPEED_THRESHOLD } from './constants';
import type {
  BusData,
  BusDataResponse,
  BusGeoJsonFeature,
  LatLng,
} from './types';

export const secsToMin = (seconds: number) => Math.round(seconds / 60);

export const formatVehicleRef = (vehicleRef = '') => {
  const str = vehicleRef.trim().replace('_', ' ');
  return `${str.charAt(0).toUpperCase()}${str.substr(1)}`;
};

export const formatSpeed = (speed: string) => {
  const speedNum = parseFloat(speed);
  return Number.isNaN(speedNum) ? '-' : speedNum.toFixed(1);
};

export const formatTime = (timeInSeconds: number) => {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = timeInSeconds % 60;
  const minPart = minutes ? `${minutes} min` : '';
  const secPart = seconds ? `${seconds} s` : '';
  return [minPart, secPart].filter(Boolean).join(' ');
};

const getBusStatus = (delayMin: number) => {
  if (delayMin > 1) {
    return 'LATE';
  } else if (delayMin < -1) {
    return 'EARLY';
  } else {
    return 'ON_TIME';
  }
};

export const getDelayString = (delayMin: number) => {
  if (delayMin > 0) {
    return `Late ${delayMin} min`;
  } else if (delayMin < 0) {
    return `Early ${Math.abs(delayMin)} min`;
  } else {
    return 'On time';
  }
};

export const convertToGeoJson = (
  buses: BusDataResponse = {}
): GeoJSON.FeatureCollection<GeoJSON.Geometry> => {
  const features = Object.keys(buses).map<BusGeoJsonFeature>((key) => {
    const { location, delay, bearing, ...rest } = buses[key];
    const { latitude, longitude } = location;
    const delayMin = secsToMin(delay);
    const status = getBusStatus(delayMin);
    return {
      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      type: 'Feature',
      properties: {
        ...rest,
        bearing,
        markerRotation: bearing != null ? bearing - 45 : 0,
        latitude,
        longitude,
        delayMin,
        status,
      },
    };
  });

  return {
    type: 'FeatureCollection',
    features,
  };
};

export const convertPointToGeoJson = ({
  latitude,
  longitude,
}: LatLng): GeoJSON.Geometry => ({
  type: 'Point',
  coordinates: [longitude, latitude],
});

export const isWithinBoundingBox = (
  { latitude, longitude }: LatLng,
  [west, south, east, north]: [number, number, number, number]
) =>
  latitude >= south &&
  latitude <= north &&
  longitude >= west &&
  longitude <= east;

const getAnimationFrameData = (
  prev: BusData,
  curr: BusData,
  progress: number
): BusData => {
  if (progress >= 1) {
    return curr;
  }

  // TODO: Add check if location difference is too large
  const ret = {
    ...curr,
  };

  if (prev.bearing && curr.bearing) {
    let bearingDelta = (360 + curr.bearing - prev.bearing) % 360;
    if (bearingDelta < 180) {
      ret.bearing = (prev.bearing + progress * bearingDelta) % 360;
    } else {
      bearingDelta = 360 - bearingDelta;
      ret.bearing = (prev.bearing - progress * bearingDelta) % 360;
    }
  }

  const { latitude: prevLatitude, longitude: prevLongitude } = prev.location;
  const { latitude, longitude } = curr.location;

  ret.location = {
    latitude: prevLatitude + progress * (latitude - prevLatitude),
    longitude: prevLongitude + progress * (longitude - prevLongitude),
  };

  return ret;
};

export const getAnimationFrameBuses = (
  oldBuses: BusDataResponse,
  currBuses: BusDataResponse,
  progress: number
): BusDataResponse => {
  const frameBuses: BusDataResponse = {};

  Object.keys(currBuses).forEach((key) => {
    const currentData = currBuses[key];
    const previousData = oldBuses?.[key];

    if (parseFloat(currentData.speed) < RELIABLE_SPEED_THRESHOLD) {
      // Speed is too low, keep the old bearing if available or set as null
      currentData.bearing = previousData && previousData.bearing;
      // TODO: Also, filter out unrealistic bearing changes (close to 180 degrees)
    }

    const frameData = previousData
      ? getAnimationFrameData(previousData, currentData, progress)
      : currentData;

    frameBuses[key] = frameData;
  });

  return frameBuses;
};
