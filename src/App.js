import React, { Component } from 'react';
import logo from './logo.svg';
import { Map } from './Map';
import './App.css';

class App extends Component {
  render() {
    return (
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h1 className="App-title">Welcome to react-onnikka</h1>
        </header>
        <Map className="Map" />
      </div>
    );
  }
}

export default App;
