import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { searchLocal, searchRemote, searchGoogle, resolveGoogle } from '../lib/places.js';
import { placeShort } from '../lib/format.js';

export default function PlacePicker({ value, onChange, placeholder, kind, autoFocus }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState([]);
  const [loading, setLoading] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    const ac = new AbortController();
    setRemote([]);
    if (q.trim().length < 4) return undefined;
    setLoading(true);
    const t = setTimeout(async () => {
      const g = await searchGoogle(q);
      const r = g.length ? g : await searchRemote(q, ac.signal);
      if (!ac.signal.aborted) { setRemote(r); setLoading(false); }
    }, 300);
    return () => { clearTimeout(t); ac.abort(); setLoading(false); };
  }, [q]);

  useEffect(() => {
    const on = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, []);

  const local = searchLocal(q);
  const results = [...local, ...remote.filter((r) => r.google || !local.some((l) => Math.abs(l.lat - r.lat) < 0.001))].slice(0, 8);
  const choose = async (p) => {
    setOpen(false); setQ('');
    if (p.google) {
      try { onChange(await resolveGoogle(p)); } catch { /* keep previous value */ }
    } else onChange(p);
  };

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <div className="row" style={{ background: 'var(--bg-elevated)', border: '1px solid', borderColor: open ? 'var(--blue)' : 'var(--border)', borderRadius: 8, padding: '0 12px', minHeight: 54, boxShadow: open ? '0 0 0 3px var(--accent-soft)' : 'none' }}>
        <div style={{ width: 14, height: 14, flex: 'none', borderRadius: kind === 'pickup' ? '50%' : 4, background: kind === 'pickup' ? 'var(--green)' : 'var(--label)' }} />
        {value && !open ? (
          <button className="spacer" style={{ border: 0, background: 'none', textAlign: 'left', padding: '8px 0', cursor: 'text', minWidth: 0 }} onClick={() => setOpen(true)}>
            <div className="headline truncate">{value.name}</div>
            <div className="footnote secondary truncate">{value.address}, {placeShort(value)}</div>
          </button>
        ) : (
          <input className="spacer" autoFocus={autoFocus || open} style={{ border: 0, background: 'none', outline: 'none', fontSize: '1.0625rem', height: 56, minWidth: 0 }}
            placeholder={placeholder} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
        )}
        {loading && <span className="spinner" style={{ color: 'var(--label-3)' }} />}
        {value && !open && <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Change" onClick={() => setOpen(true)}><Icon name="search" size={15} /></button>}
      </div>
      {open && (
        <div className="list glass" style={{ position: 'absolute', zIndex: 600, left: 0, right: 0, top: 'calc(100% + 6px)', maxHeight: 360, overflowY: 'auto' }}>
          {results.length === 0 && <div className="list-row secondary subhead">{loading ? 'Searching…' : 'No places found. Try a street and city.'}</div>}
          {results.map((p, i) => (
            <button key={`${p.lat},${p.lng},${i}`} className="list-row indent" onClick={() => choose(p)}>
              <div className="icon-tile" style={{ background: p.remote ? 'var(--label-3)' : 'var(--blue)', borderRadius: 16 }}><Icon name={p.remote ? 'pin' : 'building'} size={17} /></div>
              <div className="label">
                <div className="headline truncate">{p.name}</div>
                <div className="footnote secondary truncate">{p.address}{p.city ? `, ${placeShort(p)}` : ''}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
