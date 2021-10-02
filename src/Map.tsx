// @flow
import React, { Component, MouseEvent } from 'react';
import mapboxgl, { GeoJSONSource } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  TopLeftMapNotification,
  TopRightMapNotification,
} from './MapNotification';
import { BUS_API_URL } from './config';
import {
  convertToGeoJson,
  formatSpeed,
  formatTime,
  formatVehicleRef,
  getDelayString,
  secsToMin,
  convertPointToGeoJson,
  isWithinBoundingBox,
} from './utils';
import type { BusDataResponse, LatLng } from './types';

// eslint-disable-next-line no-unused-vars
const COLOR_THEME = {
  LATE: '#d32d7d',
  EARLY: '#009f7e',
  ON_TIME: '#0079c2',
};

const UPDATE_INTERVAL = 2000; // ms
const STALE_DATA_CHECK_INTERVAL = 1000; // ms
const STALE_DATA_THRESHOLD = 10; // s
const RELIABLE_SPEED_THRESHOLD = 1; // km/h

const BUS_MARKER_SOURCE_NAME = 'bus-marker-source';
const CURRENT_POSITION_SOURCE_NAME = 'current-location';

const TAMPERE_BBOX: [number, number, number, number] = [
  23.647643287532077, 61.37612570456474, 23.905361244117643, 61.58820555151834,
];

type PopupData = {
  latitude: number;
  longitude: number;
  journeyPatternRef: string;
  vehicleRef: string;
  delayMin: number;
  speed: string;
};

type Props = {
  className: string;
};

type State = {
  dataAge: number | null;
};

export class Map extends Component<Props, State> {
  state = {
    dataAge: null,
  };

  staleDataCheckIntervalId?: NodeJS.Timer;
  updateTimeoutId?: NodeJS.Timer;
  positionWatcherId?: number;
  currentPosition: LatLng = { latitude: 0, longitude: 0 };
  map?: mapboxgl.Map;
  popup?: mapboxgl.Popup;
  el?: HTMLDivElement | null;
  dataTimestamp?: number;
  buses?: BusDataResponse;
  selectedVehicleRef?: string | null;

  componentDidMount() {
    const accessToken = import.meta.env.VITE_MAPBOX_API_TOKEN as string;
    const { VITE_APP_VERSION, VITE_APP_BUILD_TIME } = import.meta.env;

    console.log('App version', VITE_APP_VERSION);
    console.log('Built on', VITE_APP_BUILD_TIME);

    this.fetchBuses();
    this.staleDataCheckIntervalId = setInterval(
      this.checkForStaleData,
      STALE_DATA_CHECK_INTERVAL
    );

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(this.zoomToCurrentPosition);
      this.positionWatcherId = navigator.geolocation.watchPosition(
        this.updateCurrentPosition
      );
    }

    if (!accessToken) {
      console.error('Mapbox API token is not specified');
      return;
    }

    if (!mapboxgl.supported) {
      console.error('WebGL not supported');
      return;
    }

    this.map = new mapboxgl.Map({
      accessToken,
      container: this.el!,
      style: 'mapbox://styles/mikkom/cjd8g272r21822rrwi2p4hhs4',
    });

    // Disable map rotation using right click + drag
    this.map.dragRotate.disable();

    // Disable map rotation using touch rotation gesture
    this.map.touchZoomRotate.disableRotation();

    this.map.fitBounds(TAMPERE_BBOX, {
      padding: 0,
      animate: false,
    });

    this.map.on('load', this.onMapLoaded);
  }

  componentWillUnmount() {
    const {
      updateTimeoutId,
      staleDataCheckIntervalId,
      positionWatcherId,
      map,
    } = this;

    if (updateTimeoutId) {
      clearTimeout(updateTimeoutId);
    }

    if (staleDataCheckIntervalId) {
      clearInterval(staleDataCheckIntervalId);
    }

    if (positionWatcherId) {
      navigator.geolocation.clearWatch(positionWatcherId);
    }

    if (map) {
      map.remove();
    }
  }

  checkForStaleData = () => {
    const { dataTimestamp } = this;
    if (dataTimestamp) {
      const { dataAge: prevDataAge } = this.state;
      const dataAgeMs = Date.now() - dataTimestamp;
      const dataAge = Math.round(dataAgeMs / 1000);
      if (dataAge >= STALE_DATA_THRESHOLD && prevDataAge !== dataAge) {
        this.setState({ dataAge });
      } else if (dataAge < STALE_DATA_THRESHOLD && prevDataAge) {
        this.setState({ dataAge: null });
      }
    }
  };

  zoomToCurrentPosition = ({ coords }: GeolocationPosition) => {
    if (isWithinBoundingBox(coords, TAMPERE_BBOX)) {
      const { latitude, longitude } = coords;
      this.map?.flyTo({ center: [longitude, latitude], zoom: 14 });
    }
  };

  updateCurrentPosition = ({ coords }: GeolocationPosition) => {
    this.currentPosition = coords;
    const source = this.map?.getSource(
      CURRENT_POSITION_SOURCE_NAME
    ) as GeoJSONSource;
    if (!source) {
      // Source is not ready yet
      return;
    }
    const geoJson = convertPointToGeoJson(coords);
    // FIXME
    source.setData(geoJson as unknown as string);
  };

  updateBuses = (buses: BusDataResponse) => {
    this.dataTimestamp = Date.now();
    if (this.buses) {
      Object.keys(buses).forEach((key) => {
        const currentData = buses[key];
        const previousData = this.buses && this.buses[key];
        if (parseFloat(currentData.speed) < RELIABLE_SPEED_THRESHOLD) {
          // Speed is too low, keep the old bearing if available or set as null
          currentData.bearing = previousData && previousData.bearing;
        }
      });
    }
    this.buses = buses;
    const source = this.map?.getSource(
      BUS_MARKER_SOURCE_NAME
    ) as GeoJSONSource | null;
    if (!source) {
      // Source is not ready yet
      return;
    }
    const geoJson = convertToGeoJson(buses);
    // FIXME
    source.setData(geoJson as unknown as string);

    const { selectedVehicleRef, popup } = this;
    if (selectedVehicleRef && popup) {
      const bus = buses[selectedVehicleRef];
      if (bus) {
        this.updatePopup({
          ...bus,
          ...bus.location,
          delayMin: secsToMin(bus.delay),
        });
      }
    }
  };

  restartUpdateTimer = () => {
    this.updateTimeoutId = setTimeout(this.fetchBuses, UPDATE_INTERVAL);
  };

  fetchBuses = () => {
    if (document.hidden) {
      // Let's not hit the API when the app is hidden
      this.restartUpdateTimer();
      return;
    }

    fetch(BUS_API_URL)
      .then((response) => response.json())
      .then(this.updateBuses)
      .then(this.restartUpdateTimer)
      .catch((err) => {
        console.error(err);
        this.restartUpdateTimer();
      });
  };

  setMapContainer = (el: HTMLDivElement | null) => {
    this.el = el;
  };

  removePopup = () => {
    this.selectedVehicleRef = null;
    if (this.popup) {
      this.popup.remove();
    }
  };

  updatePopup = ({
    latitude,
    longitude,
    journeyPatternRef,
    vehicleRef,
    delayMin,
    speed,
  }: PopupData) => {
    const vehicle = formatVehicleRef(vehicleRef);
    this.popup?.setLngLat([longitude, latitude]).setHTML(
      `<b>Line ${journeyPatternRef}</b>${vehicle && ` (${vehicle})`}
      <br />
      ${getDelayString(delayMin)}<br />
      Speed ${formatSpeed(speed)} km/h`
    );
  };

  handleSymbolClick = (e: any) => {
    const feature = e.features[0];
    const bus = feature.properties;
    this.removePopup();
    this.selectedVehicleRef = bus.vehicleRef;
    this.popup = new mapboxgl.Popup({ closeButton: false });
    this.updatePopup(bus);
    if (this.map) {
      this.popup.addTo(this.map);
    }
  };

  onMapLoaded = () => {
    if (!this.map) {
      return;
    }

    this.map.addSource(BUS_MARKER_SOURCE_NAME, {
      type: 'geojson',
      data: convertToGeoJson(this.buses),
    });

    this.map.addSource(CURRENT_POSITION_SOURCE_NAME, {
      type: 'geojson',
      // FIXME
      data: convertPointToGeoJson(this.currentPosition) as unknown as string,
    });

    this.map.addLayer({
      id: 'current-position-layer',
      type: 'symbol',
      source: CURRENT_POSITION_SOURCE_NAME,
      layout: {
        'icon-image': 'current-location',
        'icon-size': 0.85,
        'icon-allow-overlap': true,
        'icon-ignore-placement': false, // default
        'icon-anchor': 'center',
      },
    });

    this.map.addLayer({
      id: 'bus-marker-layer',
      type: 'symbol',
      source: BUS_MARKER_SOURCE_NAME,
      layout: {
        'icon-image': [
          'case',
          ['==', ['get', 'bearing'], null],
          [
            'match',
            ['get', 'status'],
            'LATE',
            'stationary-bus-late',
            'EARLY',
            'stationary-bus-early',
            /* default */ 'stationary-bus',
          ],
          [
            'match',
            ['get', 'status'],
            'LATE',
            'bus-marker-late',
            'EARLY',
            'bus-marker-early',
            /* default */ 'bus-marker',
          ],
        ],
        'icon-rotate': { type: 'identity', property: 'markerRotation' },
        'icon-size': 0.85,
        'icon-allow-overlap': true,
        'icon-ignore-placement': false, // default
        'text-allow-overlap': false, // default
        'text-ignore-placement': false, // default
        'text-optional': true,
        'icon-anchor': 'center',
        'text-field': '{journeyPatternRef}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 14,
      },
      paint: {
        'text-color': '#FFFFFF',
      },
    });

    this.map.on('click', 'bus-marker-layer', this.handleSymbolClick);
  };

  resizeMap = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    this.map && this.map.resize();
  };

  render() {
    const { className } = this.props;
    const { dataAge } = this.state;
    return (
      <div ref={this.setMapContainer} className={className}>
        {dataAge && (
          <TopLeftMapNotification>{`The bus data is ${formatTime(
            dataAge
          )} old`}</TopLeftMapNotification>
        )}
        <TopRightMapNotification onClick={this.resizeMap}>
          {import.meta.env.VITE_APP_BUILD_TIME || 'development'}
        </TopRightMapNotification>
      </div>
    );
  }
}
