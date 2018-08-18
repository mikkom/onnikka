// @flow
import React, { Component } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  TopLeftMapNotification,
  TopRightMapNotification
} from './MapNotification';
import { BUS_API_URL } from './config';
import {
  convertToGeoJson,
  formatTime,
  formatVehicleRef,
  getDelayString,
  secsToMin,
  convertPointToGeoJson,
  isWithinBoundingBox
} from './utils';
import type { BusDataResponse, LatLng } from './types';

// eslint-disable-next-line no-unused-vars
const COLOR_THEME = {
  LATE: '#d32d7d',
  EARLY: '#009f7e',
  ON_TIME: '#0079c2'
};

const UPDATE_INTERVAL = 2000; // ms
const STALE_DATA_CHECK_INTERVAL = 1000; // ms
const STALE_DATA_THRESHOLD = 10; // s
const RELIABLE_SPEED_THRESHOLD = 1; // km/h

const BUS_MARKER_SOURCE_NAME = 'bus-marker-source';
const CURRENT_POSITION_SOURCE_NAME = 'current-location';

const TAMPERE_BBOX = [
  23.647643287532077,
  61.37612570456474,
  23.905361244117643,
  61.58820555151834
];

type PopupData = {
  latitude: number,
  longitude: number,
  journeyPatternRef: string,
  vehicleRef: string,
  delayMin: number,
  speed: string
};

type Props = {
  className: string
};

type State = {
  dataAge: ?number
};

export class Map extends Component<Props, State> {
  state = {
    dataAge: null
  };

  staleDataCheckIntervalId: any;
  updateTimeoutId: any;
  positionWatcherId: any;
  currentPosition: LatLng = { latitude: 0, longitude: 0 };
  map: mapboxgl.Map;
  popup: mapboxgl.Popup;
  el: ?HTMLDivElement;
  dataTimestamp: ?number;
  buses: BusDataResponse;
  selectedVehicleRef: ?string;

  componentDidMount() {
    const {
      REACT_APP_VERSION,
      REACT_APP_BUILD_TIME,
      REACT_APP_MAPBOX_API_TOKEN
    } = process.env;

    console.log('App version', REACT_APP_VERSION);
    console.log('Built on', REACT_APP_BUILD_TIME);

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

    if (REACT_APP_MAPBOX_API_TOKEN) {
      mapboxgl.accessToken = REACT_APP_MAPBOX_API_TOKEN;
    }

    if (!mapboxgl.supported) {
      console.error('WebGL not supported');
      return;
    }

    this.map = new mapboxgl.Map({
      container: this.el,
      style: 'mapbox://styles/mikkom/cjd8g272r21822rrwi2p4hhs4'
    });

    this.map.fitBounds(TAMPERE_BBOX, {
      padding: 0,
      animate: false
    });

    this.map.on('load', this.onMapLoaded);
  }

  componentWillUnmount() {
    const {
      updateTimeoutId,
      staleDataCheckIntervalId,
      positionWatcherId,
      map
    } = this;

    if (updateTimeoutId) {
      clearTimeout(updateTimeoutId);
      this.updateTimeoutId = null;
    }

    if (staleDataCheckIntervalId) {
      clearInterval(staleDataCheckIntervalId);
      this.staleDataCheckIntervalId = null;
    }

    if (positionWatcherId) {
      navigator.geolocation.clearWatch(positionWatcherId);
      this.positionWatcherId = null;
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

  zoomToCurrentPosition = ({ coords }: Position) => {
    if (isWithinBoundingBox(coords, TAMPERE_BBOX)) {
      const { latitude, longitude } = coords;
      this.map.flyTo({ center: [longitude, latitude], zoom: 14 });
    }
  };

  updateCurrentPosition = ({ coords }: Position) => {
    this.currentPosition = coords;
    const source = this.map.getSource(CURRENT_POSITION_SOURCE_NAME);
    if (!source) {
      // Source is not ready yet
      return;
    }
    const geoJson = convertPointToGeoJson(coords);
    source.setData(geoJson);
  };

  updateBuses = (buses: BusDataResponse) => {
    this.dataTimestamp = Date.now();
    if (this.buses) {
      Object.keys(buses).forEach(key => {
        const currentData = buses[key];
        const previousData = this.buses[key];
        if (parseFloat(currentData.speed) < RELIABLE_SPEED_THRESHOLD) {
          // Speed is too low, keep the old bearing if available or set as null
          currentData.bearing = previousData && previousData.bearing;
        }
      });
    }
    this.buses = buses;
    const source = this.map.getSource(BUS_MARKER_SOURCE_NAME);
    if (!source) {
      // Source is not ready yet
      return;
    }
    const geoJson = convertToGeoJson(buses);
    source.setData(geoJson);

    const { selectedVehicleRef, popup } = this;
    if (selectedVehicleRef && popup) {
      const bus = buses[selectedVehicleRef];
      if (bus) {
        this.updatePopup({
          ...bus,
          ...bus.location,
          delayMin: secsToMin(bus.delay)
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
      .then(response => response.json())
      .then(this.updateBuses)
      .then(this.restartUpdateTimer)
      .catch(err => {
        console.error(err);
        this.restartUpdateTimer();
      });
  };

  setMapContainer = (el: ?HTMLDivElement) => {
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
    speed
  }: PopupData) => {
    const vehicle = formatVehicleRef(vehicleRef);
    this.popup.setLngLat([longitude, latitude]).setHTML(
      `<b>Line ${journeyPatternRef}</b>${vehicle && ` (${vehicle})`}
      <br />
      ${getDelayString(delayMin)}<br />
      Speed ${speed} km/h`
    );
  };

  handleSymbolClick = (e: any) => {
    const feature = e.features[0];
    const bus = feature.properties;
    this.removePopup();
    this.selectedVehicleRef = bus.vehicleRef;
    this.popup = new mapboxgl.Popup({ closeButton: false }).addTo(this.map);
    this.updatePopup(bus);
  };

  onMapLoaded = () => {
    this.map.addSource(BUS_MARKER_SOURCE_NAME, {
      type: 'geojson',
      data: convertToGeoJson(this.buses)
    });

    this.map.addSource(CURRENT_POSITION_SOURCE_NAME, {
      type: 'geojson',
      data: convertPointToGeoJson(this.currentPosition)
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
        'icon-anchor': 'center'
      }
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
            /* default */ 'stationary-bus'
          ],
          [
            'match',
            ['get', 'status'],
            'LATE',
            'bus-marker-late',
            'EARLY',
            'bus-marker-early',
            /* default */ 'bus-marker'
          ]
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
        'text-font': (['DIN Offc Pro Medium', 'Arial Unicode MS Bold']: Array<
          string
        >),
        'text-size': 14
      },
      paint: {
        'text-color': '#FFFFFF'
      }
    });

    this.map.on('click', 'bus-marker-layer', this.handleSymbolClick);
  };

  resizeMap = (e: any) => {
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
          {process.env.REACT_APP_BUILD_TIME || 'development'}
        </TopRightMapNotification>
      </div>
    );
  }
}
