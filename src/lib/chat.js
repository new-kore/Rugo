// Chat helpers: unread counts, thread titles, opening a conversation.
import { go } from './router.js';
import { post } from './api.js';

const readAt = (t, me) => t.reads?.[me.id] || 0;

/** Unread messages for me in one thread (or all threads). */
export function unread(data, threadId) {
  const me = data.me;
  const threads = threadId ? data.threads.filter((t) => t.id === threadId) : data.threads || [];
  let n = 0;
  for (const t of threads) {
    const since = readAt(t, me);
    if ((t.lastAt || 0) <= since) continue;
    n += (data.chat || []).filter((m) => m.threadId === t.id && m.userId !== me.id && m.t > since).length;
  }
  return n;
}

/** What a thread is called for the person looking at it. */
export function threadTitle(t, data) {
  if (t.kind === 'driver') return data.me.role === 'driver' ? `${data.me.company?.name || 'Dispatch'} office` : (data.users.find((u) => u.id === t.driverId)?.name || t.name);
  return t.name;
}

export const openThread = (id) => go(`/messages?t=${id}`);

/** Dispatch: open (or create) the conversation with a driver. */
export async function messageDriver(driverId) {
  const t = await post('/chat/direct', { driverId });
  openThread(t.id);
  return t;
}

export const currentThreadParam = () => new URLSearchParams(window.location.hash.split('?')[1] || '').get('t');
