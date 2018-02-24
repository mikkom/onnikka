import React, { Component } from 'react';
import styled from 'styled-components';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// eslint-disable-next-line no-unused-vars
const COLOR_THEME = {
  LATE: '#d32d7d',
  EARLY: '#009f7e',
  ON_TIME: '#0079c2'
};

const UPDATE_INTERVAL = 1000; // milliseconds
const STALE_DATA_THRESHOLD = 5; // seconds

const MAPBOX_API_TOKEN =
  'pk.eyJ1IjoibWlra29tIiwiYSI6ImNqM2g1dXQ5eDAwMHgycXM5YXg5OTZ1NTMifQ.4Wi7iBgAcC4lyO395jwhRQ';

const BUS_API_URL =
  'https://eviuqea087.execute-api.eu-central-1.amazonaws.com/dev/buses';

const BUS_MARKER_SOURCE_NAME = 'bus-marker-source';

const TAMPERE_BBOX = [
  [23.647643287532077, 61.37612570456474],
  [23.905361244117643, 61.58820555151834]
];

const secsToMin = seconds => Math.round(seconds / 60);

const formatVehicleRef = (vehicleRef = '') => {
  const str = vehicleRef.trim().replace('_', ' ');
  return `${str.charAt(0).toUpperCase()}${str.substr(1)}`;
};

const formatTime = timeInSeconds => {
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

const getDelayString = delayMin => {
  if (delayMin > 0) {
    return `Late ${delayMin} min`;
  } else if (delayMin < 0) {
    return `Early ${Math.abs(delayMin)} min`;
  } else {
    return 'On time';
  }
};

const convertToGeoJson = (buses = []) => {
  const features = buses.map(({ location, delay, bearing, ...rest }) => {
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
        markerRotation: bearing - 45,
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

const MapNotification = styled.div`
  position: absolute;
  top: 5px;
  left: 10px;
  z-index: 1;
  color: red;
  font-weight: bold;
  background-color: white;
  padding: 5px;
`;

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
      console.log('WebGL not supported');
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
    const { latitude, longitude, accuracy } = coords;
    console.log('Position accuracy', accuracy);
    this.map.flyTo({ center: [longitude, latitude], zoom: 14 });
  };

  updateBuses = buses => {
    this.buses = buses;
    this.dataTimestamp = Date.now();
    const source = this.map.getSource(BUS_MARKER_SOURCE_NAME);
    if (!source) {
      // Not ready yet
      return;
    }
    const geoJson = convertToGeoJson(buses);
    source.setData(geoJson);
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
    const { popup } = this;
    if (popup) {
      popup.remove();
      this.popup = null;
    }
  };

  handleSymbolClick = e => {
    console.log(`got layer click with ${e.features.length} features`);
    const feature = e.features[0];
    const {
      journeyPatternRef,
      vehicleRef,
      latitude,
      longitude,
      delayMin,
      speed
    } = feature.properties;
    console.log('feature.properties', feature.properties);
    const vehicle = formatVehicleRef(vehicleRef);
    this.removePopup();
    this.popup = new mapboxgl.Popup({ closeButton: false })
      .setLngLat([longitude, latitude])
      .setHTML(
        `<b>Line ${journeyPatternRef}</b>${vehicle && ` (${vehicle})`}
        <br />
        ${getDelayString(delayMin)}<br />
        Speed ${speed} km/h`
      )
      .addTo(this.map);
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
