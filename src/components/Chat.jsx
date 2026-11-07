import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { post } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { time } from '../lib/format.js';

const ROLE = { shipper: 'Shipper', dispatcher: 'Dispatch', driver: 'Driver' };

export default function Chat({ load }) {
  const { data, toast } = useStore();
  const [text, setText] = useState('');
  const box = useRef(null);
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [load.messages.length]);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const t = text;
    setText('');
    try { await post(`/loads/${load.id}/messages`, { text: t }); } catch (err) { setText(t); toast({ title: 'Not sent', body: err.message, tone: 'error' }); }
  };
  return (
    <div className="stack">
      <div className="chat" ref={box}>
        {load.messages.length === 0 && <div className="subhead secondary" style={{ textAlign: 'center', padding: 12 }}>Send a message to everyone on this load.</div>}
        {load.messages.map((m) => {
          const me = m.userId === data.me.id;
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              <div className={`bubble-meta ${me ? 'me' : ''}`}>{me ? 'You' : `${m.name} · ${ROLE[m.role]}`} · {time(m.t)}</div>
              <div className={`bubble ${me ? 'me' : 'them'}`}>{m.text}</div>
            </div>
          );
        })}
      </div>
      <form className="row" onSubmit={send}>
        <input className="input" placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} style={{ borderRadius: 22 }} />
        <button className="icon-btn" style={{ width: 44, height: 44, background: 'var(--blue)', color: '#fff' }} aria-label="Send" disabled={!text.trim()}>
          <Icon name="send" size={20} />
        </button>
      </form>
    </div>
  );
}
