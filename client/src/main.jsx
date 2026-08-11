import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from './context/LocaleContext';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>
);
