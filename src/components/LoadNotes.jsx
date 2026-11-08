// Notes on a load, shared between the office and the driver (not the customer).
import { useState } from 'react';
import Icon from './Icon.jsx';
import { useStore } from '../lib/store.jsx';
import { post } from '../lib/api.js';
import { dayLabel } from '../lib/format.js';

const WHO = { dispatcher: 'Office', driver: 'Driver', shipper: 'Customer' };

export default function LoadNotes({ load, compact }) {
  const { data, toast, upsert } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const me = data.me;
  const notes = [...(load.messages || [])].sort((a, b) => b.t - a.t);
  const add = async (e) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const n = await post(`/loads/${load.id}/messages`, { text: t });
      upsert('loads', { ...load, messages: [...(load.messages || []).filter((x) => x.id !== n.id), n] });
      setText('');
    } catch (err) { toast({ title: 'Note not saved', body: err.message, tone: 'error' }); } finally { setBusy(false); }
  };
  return (
    <div className="stack notes">
      {load.notes && (
        <div className="note pinned">
          <div className="note-head"><Icon name="flag" size={13} /><b>From the customer</b><span className="tertiary">at booking</span></div>
          <div className="note-text">{load.notes}</div>
        </div>
      )}
      <form className="note-add" onSubmit={add}>
        <textarea className="input" rows={compact ? 2 : 3} placeholder={me.role === 'driver' ? 'Add a note for the office — gate code, delay, damage, anything…' : 'Add a note for the driver…'}
          value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); }} />
        <button className="btn primary" disabled={!text.trim() || busy}><Icon name="plus" size={15} stroke={2.4} />Add note</button>
      </form>
      {notes.length === 0 && !load.notes && <div className="subhead secondary" style={{ textAlign: 'center', padding: '6px 0' }}>No notes yet. Notes are shared between the office and the driver.</div>}
      {notes.map((n) => (
        <div key={n.id} className={`note ${n.userId === me.id ? 'mine' : ''}`}>
          <div className="note-head">
            <span className={`note-badge ${n.role}`}>{WHO[n.role] || 'Note'}</span>
            <b>{n.userId === me.id ? 'You' : n.name}</b>
            <span className="tertiary">{dayLabel(n.t)}</span>
          </div>
          <div className="note-text">{n.text}</div>
        </div>
      ))}
    </div>
  );
}
