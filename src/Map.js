import React, { Component } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_API_TOKEN =
  'pk.eyJ1IjoibWlra29tIiwiYSI6ImNqM2g1dXQ5eDAwMHgycXM5YXg5OTZ1NTMifQ.4Wi7iBgAcC4lyO395jwhRQ';

const BUS_API_URL =
  'https://eviuqea087.execute-api.eu-central-1.amazonaws.com/dev/buses';

const BUS_MARKER_SOURCE_NAME = 'bus-markers';

const TAMPERE_BBOX = [
  [23.647643287532077, 61.37612570456474],
  [23.905361244117643, 61.58820555151834]
];

const secsToMin = seconds => Math.round(seconds / 60);

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
  const features = buses.map(({ location, delay, ...rest }) => {
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

export class Map extends Component {
  componentDidMount() {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(this.updatePosition);
    }

    this.fetchBuses();
    this.intervalId = setInterval(this.fetchBuses, 1000);

    mapboxgl.accessToken = MAPBOX_API_TOKEN;

    if (!mapboxgl.supported) {
      console.log('WebGL not supported');
      return;
    }

    this.map = new mapboxgl.Map({
      container: this.el,
      // style: 'mapbox://styles/mapbox/streets-v9'
      style: 'mapbox://styles/mikkom/cj7j0ny3v5vp72rq5myy7snhy'
    });

    this.map.fitBounds(TAMPERE_BBOX, {
      padding: 0,
      animate: false
    });

    this.map.on('load', this.onMapLoaded);
  }

  componentWillUnmount() {
    // use intervalId from the state to clear the interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  updatePosition = ({ coords }) => {
    const { latitude, longitude, accuracy } = coords;
    console.log('Position accuracy', accuracy);
    this.map.flyTo({ center: [longitude, latitude], zoom: 14 });
  };

  updateBuses = buses => {
    console.log('got buses', buses);
    this.buses = buses;
    const source = this.map.getSource(BUS_MARKER_SOURCE_NAME);
    if (!source) {
      // Not ready yet
      return;
    }
    const geoJson = convertToGeoJson(buses);
    console.log('got geoJson', geoJson);
    source.setData(geoJson);
  };

  fetchBuses = () =>
    fetch(BUS_API_URL)
      .then(response => response.json())
      .then(this.updateBuses);

  setMapContainer = el => {
    this.el = el;
  };

  setPopupOnClick = e => {
    console.log('got layer click!', e);
    const feature = e.features[0];
    const { latitude, longitude, delayMin, speed } = feature.properties;
    console.log('feature.properties', feature.properties);
    new mapboxgl.Popup({ closeOnClick: true })
      .setLngLat([longitude, latitude])
      .setHTML(`<b>${getDelayString(delayMin)}</b><br />Speed ${speed} km/h`)
      .addTo(this.map);
  };

  onMapLoaded = () => {
    this.map.addSource(BUS_MARKER_SOURCE_NAME, {
      type: 'geojson',
      data: convertToGeoJson(this.buses)
    });

    this.map.addLayer({
      id: 'bus-arrows',
      type: 'symbol',
      source: BUS_MARKER_SOURCE_NAME,
      layout: {
        'icon-image': 'triangle-stroked-11',
        'icon-size': 3,
        'icon-offset': [0, -3],
        'icon-rotate': { type: 'identity', property: 'bearing' },
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-anchor': 'center'
      },
      paint: {
        'icon-color': [
          'match',
          ['get', 'status'],
          'LATE',
          '#d32d7d',
          'EARLY',
          '#009f7e',
          /* other */ '#0079c2'
        ]
      }
    });

    this.map.addLayer({
      id: 'bus-circles',
      type: 'circle',
      source: BUS_MARKER_SOURCE_NAME,
      paint: {
        'circle-color': [
          'match',
          ['get', 'status'],
          'LATE',
          '#d32d7d',
          'EARLY',
          '#009f7e',
          /* other */ '#0079c2'
        ],
        'circle-radius': 15,
        'circle-opacity': 0.9
      }
    });

    this.map.addLayer({
      id: 'bus-line-names',
      type: 'symbol',
      source: BUS_MARKER_SOURCE_NAME,
      layout: {
        'text-field': '{journeyPatternRef}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12
      },
      paint: {
        'text-color': '#FFFFFF'
      }
    });

    const showPopupOnClickLayers = [
      'bus-arrows',
      'bus-circles',
      'bus-line-names'
    ];

    showPopupOnClickLayers.forEach(layer => {
      this.map.on('click', layer, this.setPopupOnClick);
    });
  };

  render() {
    const { className } = this.props;
    return <div ref={this.setMapContainer} className={className} />;
  }
}
