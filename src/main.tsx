import { StrictMode } from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';

// Prevent double-tap zoom on iOS
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (event) => {
    const now = new Date().getTime();
    if (now - lastTouchEnd <= 500) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  },
  false
);

ReactDOM.render(
  <StrictMode>
    <App />
  </StrictMode>,
  document.getElementById('root')
);
