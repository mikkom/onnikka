import { MouseEvent, useEffect, useRef, useState } from 'react';
import mapboxgl, { EventData, GeoJSONSource } from 'mapbox-gl';
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
  getAnimationFrameBuses,
} from './utils';
import {
  BUS_ANIMATION_DURATION,
  STALE_DATA_CHECK_INTERVAL,
  STALE_DATA_THRESHOLD,
  TAMPERE_BBOX,
  UPDATE_INTERVAL,
} from './constants';
import type { BusDataResponse, LatLng } from './types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const COLOR_THEME = {
  LATE: '#d32d7d',
  EARLY: '#009f7e',
  ON_TIME: '#0079c2',
};

const BUS_MARKER_SOURCE_NAME = 'bus-marker-source';
const CURRENT_POSITION_SOURCE_NAME = 'current-location';

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

export const Map = ({ className }: Props) => {
  const [dataAge, setDataAge] = useState<number | null>(null);

  const currentPosition = useRef<LatLng>({ latitude: 0, longitude: 0 });
  const map = useRef<mapboxgl.Map>();
  const popup = useRef<mapboxgl.Popup>();
  const el = useRef<HTMLDivElement | null>();
  const buses = useRef<BusDataResponse>();
  const selectedVehicleRef = useRef<string | null>();

  const updatePopup = ({
    latitude,
    longitude,
    journeyPatternRef,
    vehicleRef,
    delayMin,
    speed,
  }: PopupData) => {
    const vehicle = formatVehicleRef(vehicleRef);
    popup.current?.setLngLat([longitude, latitude]).setHTML(
      `<b>Line ${journeyPatternRef}</b>${vehicle && ` (${vehicle})`}
      <br />
      ${getDelayString(delayMin)}<br />
      Speed ${formatSpeed(speed)} km/h`
    );
  };

  useEffect(() => {
    let updateTimeoutId: number;
    let dataTimestamp: number;
    let animationRequestId: number | undefined;

    const fetchBuses = () => {
      const restartUpdateTimer = () => {
        updateTimeoutId = setTimeout(fetchBuses, UPDATE_INTERVAL);
      };

      if (document.hidden) {
        // Let's not hit the API when the app is hidden
        restartUpdateTimer();
        return;
      }

      const updateBuses = (newBuses: BusDataResponse) => {
        // TODO: Do not animate if time difference is too large

        if (animationRequestId !== undefined) {
          cancelAnimationFrame(animationRequestId);
          animationRequestId = undefined;
        }

        dataTimestamp = Date.now();
        const oldBuses = buses.current;
        buses.current = newBuses;

        const source = map.current?.getSource(
          BUS_MARKER_SOURCE_NAME
        ) as GeoJSONSource | null;
        if (!source) {
          // Source is not ready yet
          return;
        }

        let start: number;
        const animateMarkers = (timestamp: number) => {
          if (start === undefined) start = timestamp;
          const elapsed = timestamp - start;
          const progress = elapsed / BUS_ANIMATION_DURATION;

          const animationFrameBuses = oldBuses
            ? getAnimationFrameBuses(oldBuses, newBuses, progress)
            : newBuses;

          const geoJson = convertToGeoJson(animationFrameBuses);
          // FIXME: Remove unsafe casting
          source.setData(geoJson as unknown as string);

          if (selectedVehicleRef.current && popup.current) {
            const bus = animationFrameBuses[selectedVehicleRef.current];
            if (bus) {
              updatePopup({
                ...bus,
                ...bus.location,
                delayMin: secsToMin(bus.delay),
              });
            }
          }

          animationRequestId =
            progress < 1 ? requestAnimationFrame(animateMarkers) : undefined;
        };

        animationRequestId = requestAnimationFrame(animateMarkers);
      };

      fetch(BUS_API_URL)
        .then((response) => response.json())
        .then(updateBuses)
        .then(restartUpdateTimer)
        .catch((err) => {
          console.error(err);
          restartUpdateTimer();
        });
    };

    fetchBuses();

    const checkForStaleData = () => {
      if (dataTimestamp) {
        setDataAge((dataAge) => {
          const dataAgeMs = Date.now() - dataTimestamp;
          const newDataAge = Math.round(dataAgeMs / 1000);
          if (newDataAge >= STALE_DATA_THRESHOLD && dataAge !== newDataAge) {
            return newDataAge;
          } else if (newDataAge < STALE_DATA_THRESHOLD && dataAge) {
            return null;
          } else {
            return dataAge;
          }
        });
      }
    };

    const staleDataCheckIntervalId = setInterval(
      checkForStaleData,
      STALE_DATA_CHECK_INTERVAL
    );

    return () => {
      if (updateTimeoutId) {
        clearTimeout(updateTimeoutId);
      }

      if (staleDataCheckIntervalId) {
        clearInterval(staleDataCheckIntervalId);
      }
    };
  }, []);

  useEffect(() => {
    const zoomToCurrentPosition = ({ coords }: GeolocationPosition) => {
      if (isWithinBoundingBox(coords, TAMPERE_BBOX)) {
        const { latitude, longitude } = coords;
        map.current?.flyTo({ center: [longitude, latitude], zoom: 14 });
      }
    };

    const updateCurrentPosition = ({ coords }: GeolocationPosition) => {
      currentPosition.current = coords;
      const source = map.current?.getSource(
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

    let positionWatcherId: number;
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(zoomToCurrentPosition);
      positionWatcherId = navigator.geolocation.watchPosition(
        updateCurrentPosition
      );
    }

    return () => {
      if (positionWatcherId) {
        navigator.geolocation.clearWatch(positionWatcherId);
      }
    };
  }, []);

  useEffect(() => {
    const accessToken = import.meta.env.VITE_MAPBOX_API_TOKEN as string;
    const { VITE_APP_VERSION, VITE_APP_BUILD_TIME } = import.meta.env;

    console.log('App version', VITE_APP_VERSION);
    console.log('Built on', VITE_APP_BUILD_TIME);

    if (!accessToken) {
      console.error('Mapbox API token is not specified');
      return;
    }

    if (!mapboxgl.supported) {
      console.error('WebGL not supported');
      return;
    }

    const handleSymbolClick = (e: EventData) => {
      const feature = e.features[0];
      const bus = feature.properties;
      selectedVehicleRef.current = bus.vehicleRef;
      popup.current?.remove();
      popup.current = new mapboxgl.Popup({ closeButton: false });
      updatePopup(bus);
      if (map.current) {
        popup.current.addTo(map.current);
      }
    };

    if (!el.current) {
      console.error(
        'Something is horribly wrong, map container element is missing'
      );
      return;
    }

    map.current = new mapboxgl.Map({
      accessToken,
      container: el.current,
      style: 'mapbox://styles/mikkom/cjd8g272r21822rrwi2p4hhs4',
    });

    // Disable map rotation using right click + drag
    map.current.dragRotate.disable();

    // Disable map rotation using touch rotation gesture
    map.current.touchZoomRotate.disableRotation();

    map.current.fitBounds(TAMPERE_BBOX, {
      padding: 0,
      animate: false,
    });

    const onMapLoaded = () => {
      if (!map.current) {
        return;
      }

      map.current.addSource(BUS_MARKER_SOURCE_NAME, {
        type: 'geojson',
        data: convertToGeoJson(buses.current),
      });

      map.current.addSource(CURRENT_POSITION_SOURCE_NAME, {
        type: 'geojson',
        // FIXME
        data: convertPointToGeoJson(
          currentPosition.current
        ) as unknown as string,
      });

      map.current.addLayer({
        id: 'current-position-layer',
        type: 'symbol',
        source: CURRENT_POSITION_SOURCE_NAME,
        layout: {
          'icon-image': 'current-location',
          'icon-pitch-alignment': 'map',
          'icon-size': 0.85,
          'icon-allow-overlap': true,
          'icon-ignore-placement': false, // default
          'icon-anchor': 'center',
        },
      });

      map.current.addLayer({
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
          'icon-pitch-alignment': 'map',
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

      map.current.on('click', 'bus-marker-layer', handleSymbolClick);
    };

    map.current.on('load', onMapLoaded);

    return () => {
      map.current?.remove();
    };
  }, []);

  const setMapContainer = (element: HTMLDivElement | null) => {
    el.current = element;
  };

  const resizeMap = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    map.current?.resize();
  };

  return (
    <div ref={setMapContainer} className={className}>
      {dataAge && (
        <TopLeftMapNotification>{`The bus data is ${formatTime(
          dataAge
        )} old`}</TopLeftMapNotification>
      )}
      <TopRightMapNotification onClick={resizeMap}>
        {import.meta.env.VITE_APP_BUILD_TIME || 'development'}
      </TopRightMapNotification>
    </div>
  );
};
