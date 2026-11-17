// Pickup code: the shipper and the assigned driver see the same 6-digit code and exchange it at the dock.
import { useState } from 'react';
import Icon from './Icon.jsx';
import { ActionButton, ConfirmButton } from './ui.jsx';
import { post } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { time, dayLabel } from '../lib/format.js';

const OPEN = ['accepted', 'en_route_pickup', 'at_pickup'];

const HELP = {
  shipper: 'When the driver arrives, ask them for their code. Release the freight only if it matches this one.',
  driver: 'Show this code to the shipper at the dock. Their screen shows the same code — if it doesn’t match, don’t load.',
  dispatcher: 'Your driver and the shipper both see this code. They compare it at the dock before loading.',
};

export default function PickupCode({ load, compact }) {
  const { data, upsert, toast } = useStore();
  const [show, setShow] = useState(true);
  const role = data.me.role;
  if (!load.pickupCode || load.status === 'requested' || load.status === 'cancelled') return null;
  const chk = load.pickupCheck;
  const open = OPEN.includes(load.status) && !load.loadingStartedAt;
  const act = (action) => async () => {
    try {
      const r = await post(`/loads/${load.id}/pickup-code`, { action });
      upsert('loads', r);
      if (action === 'confirm') toast({ title: 'Pickup code matched', body: role === 'shipper' ? 'You can release the freight.' : 'You can start loading.', tone: 'ok' });
      if (action === 'regenerate') toast({ title: 'New pickup code', body: 'The driver and shipper have been sent the new code.' });
    } catch (e) { toast({ title: 'Not saved', body: e.message, tone: 'error' }); }
  };

  // After pickup: one quiet line.
  if (!open) {
    if (!chk?.verifiedAt && !chk?.alertAt) return null;
    return (
      <div className={`pcode-done ${chk.alertAt ? 'bad' : ''}`}>
        <Icon name={chk.alertAt ? 'warning' : 'shield'} size={16} />
        {chk.alertAt ? `Pickup code mismatch reported by ${chk.by} · ${time(chk.alertAt)}` : `Pickup verified with code · ${chk.by} · ${dayLabel(chk.verifiedAt)} ${time(chk.verifiedAt)}`}
      </div>
    );
  }

  const digits = load.pickupCode.split('');
  return (
    <div className={`pcode ${chk?.verifiedAt ? 'ok' : chk?.alertAt ? 'bad' : ''} ${compact ? 'compact' : ''}`}>
      <div className="pcode-head">
        <div className="pcode-icon"><Icon name="shield" size={18} /></div>
        <div className="spacer">
          <div className="headline">Pickup code</div>
          <div className="footnote secondary">{HELP[role]}</div>
        </div>
        <button className="icon-btn" aria-label={show ? 'Hide code' : 'Show code'} title={show ? 'Hide code' : 'Show code'} onClick={() => setShow((x) => !x)}><Icon name="eye" size={17} /></button>
      </div>

      <div className="pcode-digits" aria-label={`Pickup code ${load.pickupCode.split('').join(' ')}`}>
        {digits.map((d, i) => <span key={i} className={i === 3 ? 'gap' : ''}>{show ? d : '•'}</span>)}
      </div>

      {chk?.verifiedAt ? (
        <div className="pcode-status ok"><Icon name="checkCircle" size={16} />Codes matched · confirmed by {chk.by} at {time(chk.verifiedAt)}</div>
      ) : chk?.alertAt ? (
        <div className="pcode-status bad"><Icon name="warning" size={16} />Mismatch reported by {chk.by} at {time(chk.alertAt)} — freight on hold. Call the carrier office.</div>
      ) : (
        <div className="pcode-status"><span className="dot" />Not checked yet{role === 'driver' && load.status !== 'at_pickup' ? ' · you’ll exchange it when you arrive' : ''}</div>
      )}

      {!chk?.verifiedAt && (role !== 'dispatcher' || chk?.alertAt) && (
        <div className="pcode-actions">
          <ActionButton className="btn green" onClick={act('confirm')}><Icon name="check" size={16} stroke={2.6} />Codes match</ActionButton>
          {!chk?.alertAt && <ConfirmButton className="btn danger" confirmLabel="Tap again — hold the freight" onConfirm={act('mismatch')}><Icon name="warning" size={16} />Doesn’t match</ConfirmButton>}
        </div>
      )}
      {role !== 'driver' && (
        <ConfirmButton className="btn plain small pcode-new" confirmLabel="Tap again to issue a new code" onConfirm={act('regenerate')}><Icon name="refresh" size={13} />Issue a new code</ConfirmButton>
      )}
    </div>
  );
}
