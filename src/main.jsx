import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './lib/store.jsx';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
