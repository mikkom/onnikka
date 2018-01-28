import React, { Component } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_API_TOKEN =
  'pk.eyJ1IjoibWlra29tIiwiYSI6ImNqM2g1dXQ5eDAwMHgycXM5YXg5OTZ1NTMifQ.4Wi7iBgAcC4lyO395jwhRQ';

export class Map extends Component {
  componentDidMount() {
    mapboxgl.accessToken = MAPBOX_API_TOKEN;

    if (!mapboxgl.supported) {
      console.log('WebGL not supported');
      return;
    }

    this.map = new mapboxgl.Map({
      container: this.el,
      style: 'mapbox://styles/mapbox/streets-v9'
    });
  }

  setMapContainer = el => {
    this.el = el;
  };

  render() {
    const { className } = this.props;
    return <div ref={this.setMapContainer} className={className} />;
  }
}
