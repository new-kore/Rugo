import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './lib/store.jsx';
import { startI18n, onLang, getLang } from './lib/i18n.js';
import App from './App.jsx';
import './styles.css';

// Re-render with the new language so dates and numbers re-format too.
function Root() {
  const [lang, setLangState] = useState(getLang());
  useEffect(() => onLang(setLangState), []);
  return <App key={lang} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      <Root />
    </StoreProvider>
  </StrictMode>,
);
startI18n();
