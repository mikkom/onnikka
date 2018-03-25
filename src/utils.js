// @flow
import { type BusDataResponse } from './types';

export const secsToMin = (seconds: number) => Math.round(seconds / 60);

export const formatVehicleRef = (vehicleRef?: string = '') => {
  const str = vehicleRef.trim().replace('_', ' ');
  return `${str.charAt(0).toUpperCase()}${str.substr(1)}`;
};

export const formatTime = (timeInSeconds: number) => {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = timeInSeconds % 60;
  const minPart = minutes ? `${minutes} min` : '';
  const secPart = seconds ? `${seconds} s` : '';
  return [minPart, secPart].filter(Boolean).join(' ');
};

const getBusStatus = delayMin => {
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

export const convertToGeoJson = (buses?: BusDataResponse = {}) => {
  const features = Object.keys(buses).map(key => {
    const { location, delay, bearing, ...rest } = buses[key];
    const { latitude, longitude } = location;
    const delayMin = secsToMin(delay);
    const status = getBusStatus(delayMin);
    return {
      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude]
      },
      type: 'Feature',
      properties: {
        ...rest,
        bearing,
        markerRotation: bearing != null ? bearing - 45 : 0,
        latitude,
        longitude,
        delayMin,
        status
      }
    };
  });

  return {
    type: 'FeatureCollection',
    features
  };
};
