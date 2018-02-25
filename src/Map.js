import React, { Component } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapNotification } from './MapNotification';
import { BUS_API_URL, MAPBOX_API_TOKEN } from './config';
import {
  convertToGeoJson,
  formatTime,
  formatVehicleRef,
  getDelayString,
  secsToMin
} from './utils';

// eslint-disable-next-line no-unused-vars
const COLOR_THEME = {
  LATE: '#d32d7d',
  EARLY: '#009f7e',
  ON_TIME: '#0079c2'
};

const UPDATE_INTERVAL = 1000; // ms
const STALE_DATA_THRESHOLD = 5; // s
const RELIABLE_SPEED_THRESHOLD = 1; // km/h

const BUS_MARKER_SOURCE_NAME = 'bus-marker-source';

const TAMPERE_BBOX = [
  [23.647643287532077, 61.37612570456474],
  [23.905361244117643, 61.58820555151834]
];

export class Map extends Component {
  state = {
    dataAge: null
  };

  componentDidMount() {
    this.fetchBuses();
    this.intervalId = setInterval(this.fetchBuses, UPDATE_INTERVAL);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(this.updatePosition);
    }

    mapboxgl.accessToken = MAPBOX_API_TOKEN;

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
    const { intervalId, map } = this;
    if (intervalId) {
      clearInterval(intervalId);
      this.intervalId = null;
    }

    if (map) {
      map.remove();
      this.map = null;
    }
  }

  checkForStaleData = () => {
    if (this.dataTimestamp) {
      const { dataAge: prevDataAge } = this.state;
      const dataAgeMs = Date.now() - this.dataTimestamp;
      const dataAge = Math.round(dataAgeMs / 1000);
      if (dataAge >= STALE_DATA_THRESHOLD && prevDataAge !== dataAge) {
        this.setState({ dataAge });
      } else if (dataAge < STALE_DATA_THRESHOLD && prevDataAge) {
        this.setState({ dataAge: null });
      }
    }
  };

  updatePosition = ({ coords }) => {
    const { latitude, longitude } = coords;
    this.map.flyTo({ center: [longitude, latitude], zoom: 14 });
  };

  updateBuses = buses => {
    this.dataTimestamp = Date.now();
    if (this.buses) {
      Object.keys(buses).forEach(key => {
        const currentData = buses[key];
        const previousData = this.buses[key];
        if (previousData && currentData.speed < RELIABLE_SPEED_THRESHOLD) {
          // Speed is too low, keep the old bearing
          currentData.bearing = previousData.bearing;
        }
      });
    }
    this.buses = buses;
    const source = this.map.getSource(BUS_MARKER_SOURCE_NAME);
    if (!source) {
      // Not ready yet
      return;
    }
    const geoJson = convertToGeoJson(buses);
    source.setData(geoJson);

    if (this.selectedVehicleRef && this.popup) {
      const bus = buses[this.selectedVehicleRef];
      if (bus) {
        this.updatePopup({
          ...bus,
          ...bus.location,
          delayMin: secsToMin(bus.delay)
        });
      }
    }
  };

  fetchBuses = () => {
    this.checkForStaleData();
    return fetch(BUS_API_URL)
      .then(response => response.json())
      .then(this.updateBuses);
  };

  setMapContainer = el => {
    this.el = el;
  };

  removePopup = () => {
    this.selectedVehicleRef = null;
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
  };

  updatePopup = ({
    latitude,
    longitude,
    journeyPatternRef,
    vehicleRef,
    delayMin,
    speed
  }) => {
    const vehicle = formatVehicleRef(vehicleRef);
    this.popup.setLngLat([longitude, latitude]).setHTML(
      `<b>Line ${journeyPatternRef}</b>${vehicle && ` (${vehicle})`}
      <br />
      ${getDelayString(delayMin)}<br />
      Speed ${speed} km/h`
    );
  };

  handleSymbolClick = e => {
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

    this.map.addLayer({
      id: 'bus-marker-layer',
      type: 'symbol',
      source: BUS_MARKER_SOURCE_NAME,
      layout: {
        'icon-image': [
          'match',
          ['get', 'status'],
          'LATE',
          'bus-marker-late',
          'EARLY',
          'bus-marker-early',
          /* default */ 'bus-marker'
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
        'text-size': 14
      },
      paint: {
        'text-color': '#FFFFFF'
      }
    });

    this.map.on('click', 'bus-marker-layer', this.handleSymbolClick);
  };

  render() {
    const { className } = this.props;
    const { dataAge } = this.state;
    return (
      <div ref={this.setMapContainer} className={className}>
        {dataAge && (
          <MapNotification>{`The bus data is ${formatTime(
            dataAge
          )} old`}</MapNotification>
        )}
      </div>
    );
  }
}
