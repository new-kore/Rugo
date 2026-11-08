// Internal chat: the office and its drivers. Two panes on desktop, list → conversation on phones.
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Avatar, Sheet, Field, ActionButton, ConfirmButton, Empty, Lightbox } from '../components/ui.jsx';
import { useStore, useIndex, useNow, isActive } from '../lib/store.jsx';
import { post, del } from '../lib/api.js';
import { compressImage } from '../lib/image.js';
import { go } from '../lib/router.js';
import { time, ago } from '../lib/format.js';
import { unread, threadTitle, openThread, currentThreadParam } from '../lib/chat.js';

const QUICK = {
  driver: ['On my way', 'Running late', 'At the dock', 'Loaded and rolling', 'Delayed at shipper', 'Please call me'],
  dispatcher: ['Please send an update', 'Call me when you can', 'Take your break', 'Check your next load', 'Thanks 👍'],
};

function dayHeader(t) {
  const d = new Date(t); const today = new Date(); const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' });
}

function ThreadIcon({ t, data, size = '' }) {
  if (t.kind === 'driver') {
    const u = data.me.role === 'driver' ? null : data.users.find((x) => x.id === t.driverId);
    if (u) return <Avatar user={u} size={size} />;
    return <div className={`avatar ${size}`} style={{ background: 'var(--blue)' }}><Icon name="building" size={16} /></div>;
  }
  return <div className={`avatar ${size}`} style={{ background: t.kind === 'announce' ? 'var(--orange)' : 'var(--indigo)' }}><Icon name={t.kind === 'announce' ? 'bell' : 'people'} size={16} /></div>;
}

export default function Messages() {
  const { data } = useStore();
  useNow(30000);
  const [active, setActive] = useState(currentThreadParam);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const on = () => setActive(currentThreadParam());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const threads = useMemo(() => [...(data.threads || [])]
    .map((t) => ({ t, title: threadTitle(t, data), n: unread(data, t.id) }))
    .filter((x) => !q || x.title.toLowerCase().includes(q.toLowerCase()) || (x.t.lastText || '').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.t.kind === 'announce') - (a.t.kind === 'announce') || (b.t.lastAt || 0) - (a.t.lastAt || 0)), [data, q]);
  const current = (data.threads || []).find((t) => t.id === active);
  const isDispatch = data.me.role === 'dispatcher';

  return (
    <div className={`msg-layout ${current ? 'has-active' : ''}`}>
      <aside className="msg-list">
        <div className="msg-list-head">
          <div className="search-field"><Icon name="search" size={15} /><input placeholder="Search messages" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {isDispatch && <button className="icon-btn" aria-label="New group or announcement" title="New group or announcement" onClick={() => setCreating(true)}><Icon name="plus" size={18} /></button>}
        </div>
        <div className="msg-items">
          {threads.map(({ t, title, n }) => (
            <button key={t.id} className={`msg-item ${t.id === active ? 'on' : ''}`} onClick={() => openThread(t.id)}>
              <ThreadIcon t={t} data={data} />
              <div className="spacer" style={{ minWidth: 0 }}>
                <div className="row between" style={{ gap: 6 }}>
                  <span className={`truncate ${n ? 'headline' : ''}`}>{title}</span>
                  <span className="caption tertiary" style={{ flex: 'none' }}>{t.lastAt ? ago(t.lastAt) : ''}</span>
                </div>
                <div className="row between" style={{ gap: 6 }}>
                  <span className={`footnote truncate ${n ? '' : 'secondary'}`}>{t.lastText ? `${t.lastBy && t.lastBy !== data.me.name && t.kind !== 'driver' ? `${t.lastBy.split(' ')[0]}: ` : t.lastBy === data.me.name ? 'You: ' : ''}${t.lastText}` : t.kind === 'announce' ? 'Announcements to every driver' : 'No messages yet'}</span>
                  {n > 0 && <span className="badge">{n}</span>}
                </div>
              </div>
            </button>
          ))}
          {threads.length === 0 && <div className="subhead secondary" style={{ padding: 16 }}>No conversations match.</div>}
        </div>
      </aside>
      <section className="msg-thread">
        {current ? <Conversation key={current.id} t={current} /> : <Empty icon="message" title="Pick a conversation">{isDispatch ? 'Message any driver, a group, or every driver at once.' : 'Message the office any time.'}</Empty>}
      </section>
      {creating && <NewThread onClose={() => setCreating(false)} />}
    </div>
  );
}

function Conversation({ t }) {
  const { data, toast } = useStore();
  const idx = useIndex();
  const me = data.me;
  const isDispatch = me.role === 'dispatcher';
  const msgs = useMemo(() => (data.chat || []).filter((m) => m.threadId === t.id).sort((a, b) => a.t - b.t), [data.chat, t.id]);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [loadId, setLoadId] = useState('');
  const [showQuick, setShowQuick] = useState(me.role === 'driver');
  const [lightbox, setLightbox] = useState(null);
  const box = useRef(null);
  const readOnly = t.kind === 'announce' && !isDispatch;
  const driver = t.kind === 'driver' ? idx.users[t.driverId] : null;
  const driverLoads = data.loads.filter((l) => isActive(l) && (t.kind === 'driver' ? l.driverId === t.driverId : me.role === 'driver' ? l.driverId === me.id : (t.memberIds || []).includes(l.driverId)));

  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [msgs.length]);
  // Mark read when opened and whenever something new arrives while it's open.
  const last = msgs[msgs.length - 1];
  useEffect(() => {
    if (last && last.userId !== me.id && (t.reads?.[me.id] || 0) < last.t) post(`/chat/threads/${t.id}/read`).catch(() => {});
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (body) => {
    const payload = body || { text, photo, loadId: loadId || undefined };
    if (!payload.text?.trim() && !payload.photo && !payload.loadId) return;
    if (!body) { setText(''); setPhoto(null); setLoadId(''); }
    try { await post(`/chat/threads/${t.id}/messages`, payload); } catch (e) { if (!body) setText(payload.text); toast({ title: 'Not sent', body: e.message, tone: 'error' }); }
  };

  const [openInfo, setOpenInfo] = useState(null);
  const audience = audienceOf(t, data);

  const subtitle = t.kind === 'driver'
    ? (isDispatch && driver ? [idx.trucks[driver.truckId] ? `Unit ${idx.trucks[driver.truckId].unit}` : null, driverLoads[0] ? `On ${driverLoads[0].ref}` : 'No active load', driver.gps?.state === 'on' ? 'GPS on' : null].filter(Boolean).join(' · ') : 'Dispatch team')
    : t.kind === 'announce' ? 'Every driver · only the office can post' : `${t.memberIds.length} drivers + office · ${t.memberIds.map((x) => idx.users[x]?.name.split(' ')[0]).filter(Boolean).join(', ')}`;

  let lastDay = '';
  return (
    <div className="convo">
      <header className="convo-head">
        <button className="icon-btn show-mobile" aria-label="Back" onClick={() => go('/messages')}><Icon name="chevronLeft" size={20} /></button>
        <ThreadIcon t={t} data={data} />
        <div className="spacer" style={{ minWidth: 0 }}>
          <div className="headline truncate">{threadTitle(t, data)}</div>
          <div className="caption secondary truncate">{subtitle}</div>
        </div>
        {isDispatch && driver?.phone && <a className="btn small" href={`tel:${driver.phone}`}><Icon name="phone" size={14} />Call</a>}
        {!isDispatch && (data.me.company?.phone || data.companies.find((c) => c.id === me.companyId)?.phone) && <a className="btn small" href={`tel:${data.me.company?.phone || data.companies.find((c) => c.id === me.companyId)?.phone}`}><Icon name="phone" size={14} />Call office</a>}
        {isDispatch && driverLoads[0] && <button className="btn small hide-mobile" onClick={() => go(`/loads/${driverLoads[0].id}`)}>Open {driverLoads[0].ref}</button>}
        {isDispatch && t.kind !== 'driver' && <ConfirmButton className="btn small danger" confirmLabel="Delete chat?" onConfirm={async () => { await del(`/chat/threads/${t.id}`); go('/messages'); }}><Icon name="trash" size={14} /></ConfirmButton>}
      </header>

      <div className="convo-body" ref={box}>
        {msgs.length === 0 && <div className="subhead secondary" style={{ textAlign: 'center', padding: 24 }}>{readOnly ? 'No announcements yet.' : 'Say hello 👋'}</div>}
        {msgs.map((m) => {
          const mine = m.userId === me.id;
          const day = dayHeader(m.t);
          const showDay = day !== lastDay; lastDay = day;
          const l = m.loadId && idx.loads[m.loadId];
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {showDay && <div className="day-sep"><span>{day}</span></div>}
              <div className={`bubble-meta ${mine ? 'me' : ''}`}>{mine ? 'You' : `${m.name}${m.role === 'dispatcher' && me.role === 'driver' ? ' · office' : ''}`} · {time(m.t)}</div>
              <div className={`bubble ${mine ? 'me' : 'them'} ${m.quick ? 'quick' : ''}`}>
                {m.photoUrl && <img src={m.photoUrl} alt="Photo" className="bubble-photo" onClick={() => setLightbox({ url: m.photoUrl, label: 'Photo', t: m.t, by: m.name })} />}
                {m.loadRef && (
                  <button className="load-chip" onClick={() => l && go(`/loads/${l.id}`)} disabled={!l}>
                    <Icon name="route" size={13} />{m.loadRef}{l ? ` · ${l.pickup.city} → ${l.dropoff.city}` : ''}
                  </button>
                )}
                {m.text && <div>{m.text}</div>}
              </div>
              {mine && <Receipt m={m} t={t} audience={audience} open={openInfo === m.id} onToggle={() => setOpenInfo(openInfo === m.id ? null : m.id)} />}
            </div>
          );
        })}
      </div>

      {readOnly ? (
        <div className="convo-foot footnote secondary" style={{ textAlign: 'center' }}>Only the office can post announcements. Reply to the office in your own chat.</div>
      ) : (
        <div className="convo-foot">
          {showQuick && (
            <div className="quick-row">
              {QUICK[me.role]?.map((qtext) => <button key={qtext} className="qchip" onClick={() => send({ text: qtext, quick: true })}>{qtext}</button>)}
            </div>
          )}
          {(photo || loadId) && (
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              {photo && <div className="attach-thumb"><img src={photo} alt="" /><button aria-label="Remove photo" onClick={() => setPhoto(null)}><Icon name="close" size={12} /></button></div>}
              {loadId && <span className="pill blue">{idx.loads[loadId]?.ref}<button className="link-btn" aria-label="Remove load" onClick={() => setLoadId('')}><Icon name="close" size={11} /></button></span>}
            </div>
          )}
          <form className="row composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <button type="button" className="icon-btn" aria-label="Quick replies" title="Quick replies" onClick={() => setShowQuick((v) => !v)}><Icon name="bolt" size={18} /></button>
            <label className="icon-btn" aria-label="Attach photo" title="Attach photo" style={{ cursor: 'pointer' }}>
              <Icon name="camera" size={18} />
              <input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files[0]; if (f) setPhoto(await compressImage(f, 1400, 0.78)); e.target.value = ''; }} />
            </label>
            {driverLoads.length > 0 && (
              <select className="icon-select" aria-label="Attach load" title="Attach a load" value={loadId} onChange={(e) => setLoadId(e.target.value)}>
                <option value="">#</option>
                {driverLoads.map((l) => <option key={l.id} value={l.id}>{l.ref} · {l.pickup.city} → {l.dropoff.city}</option>)}
              </select>
            )}
            <textarea className="input" rows={1} placeholder={t.kind === 'announce' ? 'Write an announcement to every driver' : 'Message'} value={text}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="icon-btn send" aria-label="Send" disabled={!text.trim() && !photo && !loadId}><Icon name="send" size={18} /></button>
          </form>
        </div>
      )}
      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/** Who should receive my messages in this thread: 'office' or driver ids. */
function audienceOf(t, data) {
  const me = data.me;
  if (t.kind === 'driver') return me.role === 'driver' ? ['office'] : [t.driverId];
  const drivers = t.kind === 'announce' ? data.users.filter((u) => u.role === 'driver').map((u) => u.id) : t.memberIds || [];
  return [...drivers.filter((x) => x !== me.id), ...(me.role === 'driver' ? ['office'] : [])];
}

/** Delivered / read status for one of my messages. The office counts as one recipient (first dispatcher to get it). */
function receiptsFor(m, audience) {
  const rs = Object.entries(m.receipts || {}).map(([uid, v]) => ({ uid, ...v }));
  const office = rs.filter((r) => r.role === 'dispatcher');
  const first = (xs, k) => xs.map((x) => x[k]).filter(Boolean).sort((a, b) => a - b)[0] || null;
  return audience.map((a) => {
    if (a === 'office') return { key: 'office', name: 'Office', d: first(office, 'd'), r: first(office, 'r'), by: office.find((x) => x.r)?.name };
    const r = rs.find((x) => x.uid === a);
    return { key: a, name: r?.name, d: r?.d || null, r: r?.r || null };
  });
}

function Ticks({ state }) {
  // sent: one grey tick · delivered: two grey ticks · read: two blue ticks
  return (
    <svg width={state === 'sent' ? 12 : 17} height="11" viewBox={state === 'sent' ? '0 0 12 11' : '0 0 17 11'} fill="none" stroke={state === 'read' ? 'var(--blue)' : 'var(--label-3)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M1 6l3.2 3.2L11 2" />
      {state !== 'sent' && <path d="M7.2 8.4l.8.8L16 2" />}
    </svg>
  );
}

function Receipt({ m, t, audience, open, onToggle }) {
  const { data } = useStore();
  const list = receiptsFor(m, audience);
  const n = list.length;
  const read = list.filter((x) => x.r).length;
  const delivered = list.filter((x) => x.d).length;
  const state = n && read === n ? 'read' : n && delivered === n ? 'delivered' : delivered ? 'partial' : 'sent';
  let label;
  if (n <= 1) {
    const x = list[0] || {};
    label = x.r ? `Read ${time(x.r)}` : x.d ? `Delivered ${time(x.d)}` : 'Sent';
  } else {
    label = read === n ? `Read by all ${n}` : read ? `Read by ${read} of ${n}${delivered > read ? ` · delivered to ${delivered}` : ''}` : delivered ? `Delivered to ${delivered} of ${n}` : 'Sent';
  }
  const nameOf = (x) => x.name || data.users.find((u) => u.id === x.key)?.name || 'Driver';
  return (
    <>
      <button className={`receipt ${state}`} onClick={onToggle} title="Message info">
        <Ticks state={state === 'partial' ? 'delivered' : state} />{label}
      </button>
      {open && (
        <div className="receipt-info">
          <div className="caption secondary">Sent {time(m.t)}</div>
          {list.map((x) => (
            <div key={x.key} className="row between" style={{ gap: 12 }}>
              <span className="footnote">{x.key === 'office' ? `Office${x.by ? ` (${x.by.split(' ')[0]})` : ''}` : nameOf(x)}</span>
              <span className="footnote secondary row" style={{ gap: 5 }}>
                <Ticks state={x.r ? 'read' : x.d ? 'delivered' : 'sent'} />
                {x.r ? `Read ${time(x.r)}` : x.d ? `Delivered ${time(x.d)}` : 'Not delivered yet'}
              </span>
            </div>
          ))}
          {list.length === 1 && list[0].d && list[0].r && <div className="caption secondary">Delivered {time(list[0].d)}</div>}
        </div>
      )}
    </>
  );
}

function NewThread({ onClose }) {
  const { data, toast } = useStore();
  const drivers = data.users.filter((u) => u.role === 'driver');
  const [kind, setKind] = useState('group');
  const [name, setName] = useState('');
  const [pick, setPick] = useState(() => new Set());
  const [text, setText] = useState('');
  const create = async () => {
    try {
      const t = await post('/chat/threads', { kind, name: name || (kind === 'announce' ? 'Announcements' : 'New group'), memberIds: [...pick], text });
      onClose(); openThread(t.id);
    } catch (e) { toast({ title: 'Couldn’t create', body: e.message, tone: 'error' }); }
  };
  return (
    <Sheet title="New conversation" onClose={onClose}>
      <div className="stack">
        <div className="segmented block" role="tablist">
          <button className={kind === 'group' ? 'on' : ''} onClick={() => setKind('group')}>Group chat</button>
          <button className={kind === 'announce' ? 'on' : ''} onClick={() => setKind('announce')}>Announcement channel</button>
        </div>
        <div className="footnote secondary">{kind === 'group' ? 'The drivers you pick and the office can all post.' : 'Goes to every driver. Only the office can post.'}</div>
        <Field label="Name"><input className="input" placeholder={kind === 'group' ? 'e.g. Reefer team, Night shift' : 'e.g. Safety notices'} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {kind === 'group' && (
          <Field label={`Drivers (${pick.size})`}>
            <div className="list">
              <label className="list-row"><input type="checkbox" checked={pick.size === drivers.length} onChange={(e) => setPick(new Set(e.target.checked ? drivers.map((d) => d.id) : []))} /><span className="label">Everyone</span></label>
              {drivers.map((d) => (
                <label key={d.id} className="list-row">
                  <input type="checkbox" checked={pick.has(d.id)} onChange={(e) => setPick((s) => { const n = new Set(s); if (e.target.checked) n.add(d.id); else n.delete(d.id); return n; })} />
                  <Avatar user={d} size="sm" /><span className="label">{d.name}</span>
                </label>
              ))}
            </div>
          </Field>
        )}
        <Field label="First message (optional)"><textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <ActionButton className="btn primary" disabled={kind === 'group' && !pick.size} onClick={create}>Create</ActionButton>
      </div>
    </Sheet>
  );
}
