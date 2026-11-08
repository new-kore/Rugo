// Internal chat between the office (dispatchers) and drivers.
// Threads: 'driver' (one per driver ↔ the office), 'group' (picked drivers + office), 'announce' (office → all drivers, read-only for drivers).
import { db, save, find, id, saveUpload } from './db.js';
import { publish, publishRemove, notify } from './fleet.js';

const MAX_TEXT = 4000;

export function threadVisible(viewer, t) {
  if (!t || t.companyId !== viewer.companyId) return false;
  if (viewer.role === 'dispatcher') return true;
  if (viewer.role !== 'driver') return false;
  if (t.kind === 'driver') return t.driverId === viewer.id;
  if (t.kind === 'announce') return true;
  return (t.memberIds || []).includes(viewer.id);
}

export function canSeeChat(viewer, m) {
  return threadVisible(viewer, find('threads', m.threadId));
}

/** The one-to-one thread between a driver and the office, created on first use. */
export function driverThread(driver) {
  let t = db.threads.find((x) => x.kind === 'driver' && x.driverId === driver.id);
  if (!t) {
    t = { id: id('thr'), companyId: driver.companyId, kind: 'driver', driverId: driver.id, name: driver.name, memberIds: [driver.id], createdAt: Date.now(), lastAt: 0, lastText: '', reads: {} };
    db.threads.push(t);
    save();
    publish('threads', t);
  }
  return t;
}

export function postMessage(thread, user, { text = '', photo = null, loadId = null, quick = false, system = false, at } = {}) {
  const body = String(text || '').trim().slice(0, MAX_TEXT);
  const photoUrl = photo ? saveUpload(photo) : null;
  const load = loadId ? find('loads', loadId) : null;
  const m = {
    id: id('msg'), threadId: thread.id, companyId: thread.companyId, userId: user.id, name: user.name, role: user.role,
    receipts: {},
    text: body, photoUrl, loadId: load && load.carrierId === thread.companyId ? load.id : null, loadRef: load?.ref || null, quick: !!quick, system: !!system, t: at || Date.now(),
  };
  db.chat.push(m);
  thread.lastAt = m.t;
  thread.lastText = body || (photoUrl ? '📷 Photo' : load ? `Load ${load.ref}` : '');
  thread.lastBy = user.name;
  thread.reads = { ...(thread.reads || {}), [user.id]: m.t };
  save();
  publish('threads', thread);
  publish('chat', m);
  return m;
}

/** Toast everyone in the thread except the sender. */
function alert(thread, m) {
  const preview = m.text ? (m.text.length > 90 ? `${m.text.slice(0, 90)}…` : m.text) : m.photoUrl ? 'Sent a photo' : `Shared load ${m.loadRef}`;
  const title = thread.kind === 'driver' ? (m.role === 'driver' ? `Message from ${m.name}` : `Message from ${m.name} (office)`) : `${thread.name} · ${m.name}`;
  notify((v) => v.id !== m.userId && threadVisible(v, thread), { title, body: preview, threadId: thread.id });
}

export function chatRoutes(app, auth, role) {
  const getThread = (req, res) => {
    const t = find('threads', req.params.id);
    if (!t || !threadVisible(req.user, t)) { res.status(404).json({ error: 'Conversation not found.' }); return null; }
    return t;
  };

  app.post('/api/chat/direct', auth, role('dispatcher'), (req, res) => {
    const d = find('users', req.body?.driverId);
    if (!d || d.role !== 'driver' || d.companyId !== req.user.companyId) return res.status(404).json({ error: 'Driver not found.' });
    res.json(driverThread(d));
  });

  app.post('/api/chat/threads', auth, role('dispatcher'), (req, res) => {
    const b = req.body || {};
    const kind = b.kind === 'announce' ? 'announce' : 'group';
    const name = String(b.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'Give the conversation a name.' });
    const memberIds = kind === 'announce' ? [] : [...new Set(b.memberIds || [])].filter((x) => { const u = find('users', x); return u && u.role === 'driver' && u.companyId === req.user.companyId; });
    if (kind === 'group' && !memberIds.length) return res.status(400).json({ error: 'Pick at least one driver.' });
    const t = { id: id('thr'), companyId: req.user.companyId, kind, name, memberIds, createdBy: req.user.id, createdAt: Date.now(), lastAt: Date.now(), lastText: '', reads: { [req.user.id]: Date.now() } };
    db.threads.push(t);
    save();
    publish('threads', t);
    postMessage(t, req.user, { text: `${req.user.name} created ${kind === 'announce' ? 'this announcement channel' : `the group with ${memberIds.map((x) => find('users', x)?.name.split(' ')[0]).join(', ')}`}`, system: true });
    if (b.text) alert(t, postMessage(t, req.user, { text: b.text }));
    res.json(t);
  });

  app.patch('/api/chat/threads/:id', auth, role('dispatcher'), (req, res) => {
    const t = getThread(req, res); if (!t) return;
    if (t.kind !== 'group') return res.status(400).json({ error: 'Only group chats can be edited.' });
    const b = req.body || {};
    const notes = [];
    if (b.name && String(b.name).trim() && String(b.name).trim() !== t.name) { t.name = String(b.name).trim().slice(0, 60); notes.push(`renamed the group to “${t.name}”`); }
    if (Array.isArray(b.memberIds)) {
      const next = [...new Set(b.memberIds)].filter((x) => { const u = find('users', x); return u && u.role === 'driver' && u.companyId === req.user.companyId; });
      if (!next.length) return res.status(400).json({ error: 'A group needs at least one driver.' });
      const names = (ids) => ids.map((x) => find('users', x)?.name).filter(Boolean).join(', ');
      const added = next.filter((x) => !t.memberIds.includes(x)); const removed = t.memberIds.filter((x) => !next.includes(x));
      if (added.length) notes.push(`added ${names(added)}`);
      if (removed.length) notes.push(`removed ${names(removed)}`);
      t.memberIds = next;
    }
    save();
    publish('threads', t);
    if (notes.length) postMessage(t, req.user, { text: `${req.user.name} ${notes.join(' and ')}`, system: true });
    res.json(t);
  });

  app.delete('/api/chat/threads/:id', auth, role('dispatcher'), (req, res) => {
    const t = getThread(req, res); if (!t) return;
    if (t.kind === 'driver') return res.status(400).json({ error: 'Driver conversations can’t be deleted.' });
    const gone = db.chat.filter((m) => m.threadId === t.id).map((m) => m.id);
    db.chat = db.chat.filter((m) => m.threadId !== t.id);
    db.threads = db.threads.filter((x) => x.id !== t.id);
    save();
    for (const mid of gone) publishRemove('chat', mid);
    publishRemove('threads', t.id);
    res.json({ ok: true });
  });

  app.post('/api/chat/threads/:id/messages', auth, role('dispatcher', 'driver'), (req, res) => {
    const t = getThread(req, res); if (!t) return;
    if (t.kind === 'announce' && req.user.role === 'driver') return res.status(403).json({ error: 'Only the office can post announcements.' });
    const b = req.body || {};
    if (!String(b.text || '').trim() && !b.photo && !b.loadId) return res.status(400).json({ error: 'Type a message first.' });
    const m = postMessage(t, req.user, b);
    if (b.photo && !m.photoUrl && !m.text) return res.status(400).json({ error: 'That photo couldn’t be read.' });
    alert(t, m);
    res.json(m);
  });

  // The recipient's app got the message (sent automatically by the app on arrival).
  app.post('/api/chat/delivered', auth, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : [];
    let n = 0;
    for (const mid of ids) {
      const m = find('chat', mid);
      if (m && canSeeChat(req.user, m) && stamp(m, req.user, 'd')) { publish('chat', m); n++; }
    }
    if (n) save();
    res.json({ ok: true, updated: n });
  });

  // The conversation was opened: everything in it from others counts as read.
  app.post('/api/chat/threads/:id/read', auth, (req, res) => {
    const t = getThread(req, res); if (!t) return;
    const now = Date.now();
    t.reads = { ...(t.reads || {}), [req.user.id]: now };
    for (const m of db.chat) if (m.threadId === t.id && stamp(m, req.user, 'r', now)) publish('chat', m);
    save();
    publish('threads', t);
    res.json({ ok: true });
  });
}

/** Record delivery ('d') or read ('r') of a message by a user. Read implies delivered. Returns true if anything changed. */
export function stamp(m, user, kind, at = Date.now()) {
  if (m.userId === user.id || m.t > at) return false;
  const r = (m.receipts ||= {});
  const cur = r[user.id] || { name: user.name, role: user.role };
  if (cur[kind]) return false;
  cur[kind] = at;
  if (kind === 'r' && !cur.d) cur.d = at;
  r[user.id] = cur;
  return true;
}
