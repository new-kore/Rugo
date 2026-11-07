// Minimal hash router: #/path/segments
import { useEffect, useState } from 'react';

const parse = () => (window.location.hash.replace(/^#/, '') || '/').split('?')[0];
export function useRoute() {
  const [path, setPath] = useState(parse);
  useEffect(() => {
    const on = () => { setPath(parse()); window.scrollTo(0, 0); };
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
