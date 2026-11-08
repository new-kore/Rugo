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

export function postMessage(thread, user, { text = '', photo = null, loadId = null, quick = false, at } = {}) {
  const body = String(text || '').trim().slice(0, MAX_TEXT);
  const photoUrl = photo ? saveUpload(photo) : null;
  const load = loadId ? find('loads', loadId) : null;
  const m = {
    id: id('msg'), threadId: thread.id, companyId: thread.companyId, userId: user.id, name: user.name, role: user.role,
    text: body, photoUrl, loadId: load && load.carrierId === thread.companyId ? load.id : null, loadRef: load?.ref || null, quick: !!quick, t: at || Date.now(),
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
    if (b.text) alert(t, postMessage(t, req.user, { text: b.text }));
    res.json(t);
  });

  app.patch('/api/chat/threads/:id', auth, role('dispatcher'), (req, res) => {
    const t = getThread(req, res); if (!t) return;
    if (t.kind !== 'group') return res.status(400).json({ error: 'Only group chats can be edited.' });
    const b = req.body || {};
    if (b.name) t.name = String(b.name).trim().slice(0, 60);
    if (Array.isArray(b.memberIds)) t.memberIds = [...new Set(b.memberIds)].filter((x) => { const u = find('users', x); return u && u.role === 'driver' && u.companyId === req.user.companyId; });
    save();
    publish('threads', t);
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

  app.post('/api/chat/threads/:id/read', auth, (req, res) => {
    const t = getThread(req, res); if (!t) return;
    t.reads = { ...(t.reads || {}), [req.user.id]: Date.now() };
    save();
    publish('threads', t);
    res.json({ ok: true });
  });
}
