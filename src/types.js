// @flow
export type LatLng = {
  latitude: number,
  longitude: number
};

export type BusData = {
  lineRef: string,
  journeyPatternRef: string,
  vehicleRef: string,
  location: LatLng,
  bearing: ?number,
  delay: number,
  speed: string
};

export type BusDataResponse = { [key: string]: BusData };
