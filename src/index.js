import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import registerServiceWorker from './registerServiceWorker';

// Prevent double-tap zoom on iOS
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  event => {
    const now = new Date().getTime();
    if (now - lastTouchEnd <= 500) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  },
  false
);

ReactDOM.render(<App />, document.getElementById('root'));
registerServiceWorker();
