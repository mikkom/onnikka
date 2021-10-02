// @flow
export type LatLng = {
  latitude: number;
  longitude: number;
};

export type BoundingBox = [number, number, number, number];

export type BusData = {
  lineRef: string;
  journeyPatternRef: string;
  vehicleRef: string;
  location: LatLng;
  bearing?: number;
  delay: number;
  speed: string;
};

export type BusDataResponse = { [key: string]: BusData };

export type BusStatus = 'ON_TIME' | 'LATE' | 'EARLY';

export type BusGeoJsonFeature = {
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  type: 'Feature';
  properties: {
    lineRef: string;
    journeyPatternRef: string;
    vehicleRef: string;
    bearing?: number;
    markerRotation: number;
    latitude: number;
    longitude: number;
    delayMin: number;
    speed: string;
    status: BusStatus;
  };
};
