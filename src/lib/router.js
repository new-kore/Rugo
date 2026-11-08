// Minimal hash router: #/path/segments
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

// Cross-fade between pages with the View Transitions API where the browser has it.
export const viewTransitions = typeof document !== 'undefined' && 'startViewTransition' in document;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const parse = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0];
export function useRoute() {
  const [path, setPath] = useState(parse);
  useEffect(() => {
    const on = () => {
      const next = parse();
      const apply = () => { setPath(next); window.scrollTo(0, 0); };
      if (viewTransitions && !reduced()) {
        const root = document.documentElement;
        root.classList.add('vt');
        const t = document.startViewTransition(() => flushSync(apply));
        t.finished.finally(() => root.classList.remove('vt'));
      }
      else apply();
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}
export const go = (path) => { window.location.hash = path; };
export const back = (fallback = '/') => (window.history.length > 1 ? window.history.back() : go(fallback));
export function match(pattern, path) {
  const p = pattern.split('/'); const a = path.split('/');
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
