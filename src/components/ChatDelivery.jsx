// Tells the server when this device has received messages, so senders see "Delivered".
import { useEffect, useRef } from 'react';
import { useStore } from '../lib/store.jsx';
import { post } from '../lib/api.js';

export default function ChatDelivery() {
  const { data } = useStore();
  const sent = useRef(new Set());
  const me = data.me;
  const pending = (data.chat || []).filter((m) => m.userId !== me.id && !m.receipts?.[me.id]?.d && !sent.current.has(m.id)).map((m) => m.id);
  const key = pending.join(',');
  useEffect(() => {
    if (!pending.length) return undefined;
    const t = setTimeout(() => {
      pending.forEach((id) => sent.current.add(id));
      post('/chat/delivered', { ids: pending }).catch(() => pending.forEach((id) => sent.current.delete(id)));
    }, 300);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
