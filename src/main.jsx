import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../scraper_dashboard.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
