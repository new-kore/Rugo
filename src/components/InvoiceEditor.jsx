// Carrier invoice: review and edit the auto-drafted invoice, then send it. Also the read-only view for customers.
import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { Sheet, Field, ActionButton, ConfirmButton } from './ui.jsx';
import { patch, post } from '../lib/api.js';
import { useStore } from '../lib/store.jsx';
import { go } from '../lib/router.js';
import { money2, dateTime, date } from '../lib/format.js';

export const INV_STATUS = {
  draft: { label: 'Draft — review', tone: 'orange' },
  sent: { label: 'Sent', tone: 'blue' },
  partial: { label: 'Part paid', tone: 'indigo' },
  paid: { label: 'Paid', tone: 'green' },
  void: { label: 'Void', tone: 'gray' },
};
export const isOverdue = (inv) => ['sent', 'partial'].includes(inv.status) && inv.dueDate < Date.now();
export const statusOf = (inv) => (isOverdue(inv) ? { label: 'Overdue', tone: 'red' } : INV_STATUS[inv.status]);

const TERMS = [[0, 'Due on receipt'], [15, 'Net 15'], [30, 'Net 30'], [45, 'Net 45'], [60, 'Net 60']];
const KINDS = [['linehaul', 'Line haul'], ['fuel', 'Fuel surcharge'], ['detention', 'Detention'], ['accessorial', 'Accessorial'], ['lumper', 'Lumper'], ['other', 'Other']];
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Same tax rules as the server, so totals update while typing.
const HST = { ON: 0.13, NB: 0.15, NL: 0.15, PE: 0.15, NS: 0.14 };
const CA = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
function taxes(from, to, exempt, sub) {
  if (exempt) return { rule: 'Tax exempt (customer exemption on file)', lines: [] };
  const a = (from || '').toUpperCase(); const b = (to || '').toUpperCase();
  let rule; let lines;
  if (!CA.includes(a) || !CA.includes(b)) { rule = 'Zero-rated — continuous international freight movement'; lines = []; }
  else if (HST[a]) { rule = `HST — freight picked up in ${a}`; lines = [{ label: `HST ${(HST[a] * 100).toFixed(0)}% (${a})`, rate: HST[a] }]; }
  else if (a === 'QC' && b === 'QC') { rule = 'GST + QST — move within Québec'; lines = [{ label: 'GST 5%', rate: 0.05 }, { label: 'QST 9.975%', rate: 0.09975 }]; }
  else { rule = `GST — freight picked up in ${a}`; lines = [{ label: 'GST 5%', rate: 0.05 }]; }
  return { rule, lines: lines.map((x) => ({ ...x, amount: r2(sub * x.rate) })) };
}

function printSheet() {
  document.body.classList.add('printing-sheet');
  const off = () => { document.body.classList.remove('printing-sheet'); window.removeEventListener('afterprint', off); };
  window.addEventListener('afterprint', off);
  setTimeout(() => window.print(), 50);
}

/** The invoice as the customer sees it (also used for print). */
export function InvoicePaper({ inv }) {
  const st = statusOf(inv);
  return (
    <div className="inv-paper">
      <div className="inv-top">
        <div>
          <div className="inv-from">{inv.from.name}</div>
          <div className="inv-muted">{inv.from.address}</div>
          <div className="inv-muted">{[inv.from.phone, inv.from.email].filter(Boolean).join(' · ')}</div>
          <div className="inv-muted">{[inv.from.gst && `GST/HST ${inv.from.gst}`, inv.from.qst && `QST ${inv.from.qst}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="inv-title">
          <div className="inv-h">Invoice</div>
          <div className="inv-kv"><span>Invoice no.</span><b className="mono">{inv.number}</b></div>
          <div className="inv-kv"><span>Work order</span><b className="mono">{inv.workOrder}</b></div>
          <div className="inv-kv"><span>Load</span><b className="mono">{inv.loadRef}</b></div>
          <div className="inv-kv"><span>Date</span><b>{date(inv.issueDate)}</b></div>
          <div className="inv-kv"><span>Due</span><b>{inv.terms ? date(inv.dueDate) : 'On receipt'}</b></div>
          {inv.poNumber && <div className="inv-kv"><span>PO</span><b>{inv.poNumber}</b></div>}
          <span className={`pill ${st.tone}`} style={{ marginTop: 6 }}>{st.label}</span>
        </div>
      </div>
      <div className="inv-parties">
        <div><div className="inv-label">Bill to</div><b>{inv.billTo.name}</b><div className="inv-muted">{inv.billTo.address}</div><div className="inv-muted">{inv.billTo.email}</div></div>
        <div><div className="inv-label">Service</div><b>{inv.service.pickup.city}, {inv.service.pickup.region} → {inv.service.dropoff.city}, {inv.service.dropoff.region}</b><div className="inv-muted">{inv.service.pickup.name} → {inv.service.dropoff.name}</div><div className="inv-muted">{inv.service.km} km · {inv.service.cargo}{inv.service.driver ? ` · Driver ${inv.service.driver}` : ''}</div></div>
      </div>
      <table className="inv-table">
        <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
        <tbody>{inv.lines.map((l) => <tr key={l.id}><td>{l.description}</td><td className="num">{l.qty} {l.unit}</td><td className="num">{money2(l.rate)}</td><td className="num">{money2(l.qty * l.rate)}</td></tr>)}</tbody>
        <tfoot>
          <tr><td colSpan={3}>Subtotal</td><td className="num">{money2(inv.subtotal)}</td></tr>
          {inv.taxes.map((x) => <tr key={x.label}><td colSpan={3}>{x.label}</td><td className="num">{money2(x.amount)}</td></tr>)}
          {!inv.taxes.length && <tr><td colSpan={3} className="inv-muted">{inv.taxRule}</td><td className="num">{money2(0)}</td></tr>}
          <tr className="inv-total"><td colSpan={3}>Total (CAD)</td><td className="num">{money2(inv.total)}</td></tr>
          {inv.paidAmount > 0 && <tr><td colSpan={3}>Paid</td><td className="num">−{money2(inv.paidAmount)}</td></tr>}
          {inv.paidAmount > 0 && <tr className="inv-total"><td colSpan={3}>Balance due</td><td className="num">{money2(inv.balance)}</td></tr>}
        </tfoot>
      </table>
      {inv.pod && <div className="inv-pod"><Icon name="signature" size={16} />Proof of delivery signed by {inv.pod.name} · {dateTime(inv.pod.at)} · {inv.pod.photos} delivery photos{inv.pod.damage ? ' · damage noted' : ' · no damage'}{inv.pod.url && <img src={inv.pod.url} alt="Signature" />}</div>}
      {inv.notes && <div className="inv-notes">{inv.notes}</div>}
    </div>
  );
}

/** Review / edit / send sheet for the carrier office. */
export default function InvoiceEditor({ inv: inv0, onClose }) {
  const { data, toast, upsert } = useStore();
  const live = (data.invoices || []).find((x) => x.id === inv0.id) || inv0;
  const [d, setD] = useState(() => structuredClone(live));
  const [dirty, setDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState(live.billTo.email || '');
  const [msg, setMsg] = useState('');
  const [pay, setPay] = useState(false);
  const [amt, setAmt] = useState(String(live.balance));
  const [method, setMethod] = useState('EFT');
  useEffect(() => { if (!dirty) { setD(structuredClone(live)); setTo(live.billTo.email || ''); setAmt(String(live.balance)); } }, [live, dirty]);
  const draft = live.status === 'draft';
  const set = (k, v) => { setD((x) => ({ ...x, [k]: v })); setDirty(true); };
  const setLine = (i, k, v) => { setD((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) })); setDirty(true); };
  const sub = useMemo(() => r2(d.lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0)), [d.lines]);
  const tx = taxes(d.taxRegion?.from, d.taxRegion?.to, d.taxExempt, sub);
  const total = r2(sub + tx.lines.reduce((a, x) => a + x.amount, 0));
  const load = data.loads.find((l) => l.id === live.loadId);

  const save = async () => {
    const r = await patch(`/invoices/${live.id}`, { billTo: d.billTo, poNumber: d.poNumber, terms: Number(d.terms), notes: d.notes, lines: d.lines, taxExempt: d.taxExempt });
    upsert('invoices', r); setDirty(false); return r;
  };
  const send = async () => {
    if (dirty) await save();
    const r = await post(`/invoices/${live.id}/send`, { to, message: msg });
    upsert('invoices', r); setSending(false);
    toast({ title: `${r.number} sent`, body: `Sent to ${r.sentTo}. Due ${date(r.dueDate)}.`, tone: 'ok' });
  };
  const status = async (action, extra = {}) => {
    const r = await post(`/invoices/${live.id}/status`, { action, ...extra });
    upsert('invoices', r);
    if (action === 'redraft') { toast({ title: `New draft ${r.number}`, body: `Replaces ${live.number}.` }); onClose(); }
    if (action === 'paid') { setPay(false); toast({ title: r.status === 'paid' ? `${r.number} paid` : 'Payment recorded', body: r.status === 'paid' ? 'Marked as paid in full.' : `Balance ${money2(r.balance)}.`, tone: 'ok' }); }
  };

  const st = statusOf(live);
  const action = draft
    ? <button className="btn small primary" onClick={() => setSending(true)}><Icon name="send" size={14} />Send</button>
    : <button className="btn small" onClick={printSheet}><Icon name="print" size={14} />Print</button>;

  return (
    <Sheet title={`${live.number} · ${live.workOrder}`} onClose={onClose} wide action={action}>
      <div className="stack inv-editor">
        <div className="row between wrap" style={{ gap: 8 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className={`pill ${st.tone}`}>{st.label}</span>
            {live.sentAt && <span className="footnote secondary">Sent {dateTime(live.sentAt)} to {live.sentTo}</span>}
            {load && <button className="btn plain small" onClick={() => { onClose(); go(`/loads/${load.id}`); }}><Icon name="doc" size={13} />{load.ref}</button>}
          </div>
          {!draft && (
            <div className="row wrap" style={{ gap: 6 }}>
              {['sent', 'partial'].includes(live.status) && <button className="btn small green" onClick={() => setPay(true)}><Icon name="dollar" size={14} />Record payment</button>}
              {['sent', 'partial'].includes(live.status) && <ConfirmButton className="btn small danger" confirmLabel="Tap again to void" onConfirm={() => status('void')}>Void</ConfirmButton>}
              {live.status === 'void' && !live.replacedBy && <ActionButton className="btn small" onClick={() => status('redraft')}>Make a new draft</ActionButton>}
            </div>
          )}
        </div>

        {draft && (
          <div className="inv-review">
            <Icon name="sparkles" size={16} />
            <div>Drafted automatically from {live.loadRef}: kilometres from GPS{live.lines.some((l) => l.kind === 'detention') ? ', detention from dock arrival and departure times' : ''}, tax from the pickup province. Check it, edit anything, then press <b>Send</b>.</div>
          </div>
        )}

        {draft ? (
          <>
            <div className="inv-grid">
              <Field label="Bill to"><input className="input" value={d.billTo.name} onChange={(e) => set('billTo', { ...d.billTo, name: e.target.value })} /></Field>
              <Field label="Billing email"><input className="input" type="email" value={d.billTo.email} onChange={(e) => { set('billTo', { ...d.billTo, email: e.target.value }); setTo(e.target.value); }} placeholder="ap@customer.com" /></Field>
              <Field label="Address"><input className="input" value={d.billTo.address} onChange={(e) => set('billTo', { ...d.billTo, address: e.target.value })} /></Field>
              <Field label="PO / reference"><input className="input" value={d.poNumber} onChange={(e) => set('poNumber', e.target.value)} /></Field>
              <Field label="Payment terms">
                <select className="input" value={d.terms} onChange={(e) => set('terms', Number(e.target.value))}>{TERMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </Field>
              <Field label="Invoice and work order"><div className="input static mono">{live.number} · {live.workOrder}</div></Field>
            </div>

            <div className="inv-lines">
              <div className="inv-lines-head"><span>Description</span><span>Type</span><span className="num">Qty</span><span className="num">Rate</span><span className="num">Amount</span><span /></div>
              {d.lines.map((l, i) => (
                <div key={l.id} className={`inv-line ${l.kind}`}>
                  <input className="input" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} aria-label="Description" />
                  <select className="input" value={l.kind} onChange={(e) => setLine(i, 'kind', e.target.value)} aria-label="Type">{KINDS.map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}</select>
                  <input className="input num" inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value.replace(/[^\d.]/g, ''))} aria-label="Quantity" />
                  <input className="input num" inputMode="decimal" value={l.rate} onChange={(e) => setLine(i, 'rate', e.target.value.replace(/[^\d.-]/g, ''))} aria-label="Rate" />
                  <div className="num inv-amt">{money2((Number(l.qty) || 0) * (Number(l.rate) || 0))}</div>
                  <button className="icon-btn" aria-label="Remove line" onClick={() => { setD((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) })); setDirty(true); }}><Icon name="trash" size={15} /></button>
                  {l.evidence && <div className="inv-evidence"><Icon name="clock" size={12} />Proof: arrived {dateTime(l.evidence.in)}, left {dateTime(l.evidence.out)} · {l.evidence.dwellHours} h on site, {l.evidence.freeHours} h free (from the driver app)</div>}
                </div>
              ))}
              <div className="row wrap" style={{ gap: 6 }}>
                {[['accessorial', 'Accessorial', 'each'], ['detention', 'Detention', 'h'], ['lumper', 'Lumper fee', 'each'], ['other', 'Other', 'each']].map(([k, lb, u]) => (
                  <button key={k} className="btn small" onClick={() => { setD((x) => ({ ...x, lines: [...x.lines, { id: `new${Math.random().toString(36).slice(2, 8)}`, kind: k, description: lb, qty: 1, unit: u, rate: k === 'detention' ? (data.settings?.detentionPerHour || 75) : 0 }] })); setDirty(true); }}><Icon name="plus" size={13} />{lb}</button>
                ))}
              </div>
            </div>

            <div className="inv-sum">
              <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!d.taxExempt} onChange={(e) => set('taxExempt', e.target.checked)} />Customer is tax exempt</label>
              <div className="inv-sum-rows">
                <div><span>Subtotal</span><b>{money2(sub)}</b></div>
                {tx.lines.map((x) => <div key={x.label}><span>{x.label}</span><b>{money2(x.amount)}</b></div>)}
                <div className="inv-muted" style={{ fontSize: '0.76rem' }}>{tx.rule}</div>
                <div className="inv-total-row"><span>Total</span><b>{money2(total)}</b></div>
              </div>
            </div>

            <Field label="Note on the invoice"><textarea className="input" rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
            {live.pod && <div className="inv-pod"><Icon name="signature" size={16} />Proof of delivery attached: signed by {live.pod.name} · {dateTime(live.pod.at)} · {live.pod.photos} photos</div>}

            <div className="inv-actions">
              <ActionButton className="btn" disabled={!dirty} onClick={save}>{dirty ? 'Save changes' : 'Saved'}</ActionButton>
              <button className="btn primary large" onClick={() => setSending(true)}><Icon name="send" size={16} />Review &amp; send</button>
            </div>
          </>
        ) : (
          <InvoicePaper inv={live} />
        )}

        <div className="stack-sm">
          <div className="headline">History</div>
          {live.history.slice().reverse().map((h, i) => <div key={i} className="footnote"><span className="secondary">{dateTime(h.t)} · {h.by}</span> — {h.text}</div>)}
        </div>
      </div>

      {sending && (
        <Sheet title={`Send ${live.number}`} onClose={() => setSending(false)}>
          <div className="stack">
            <div className="inv-send-sum"><div><span>To</span><b>{d.billTo.name}</b></div><div><span>Total</span><b>{money2(total)}</b></div><div><span>Due</span><b>{Number(d.terms) ? `${date(Date.now() + Number(d.terms) * 864e5)} (Net ${d.terms})` : 'On receipt'}</b></div></div>
            <Field label="Send to (billing email)"><input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="ap@customer.com" /></Field>
            <Field label="Message (optional)"><textarea className="input" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`Please find invoice ${live.number} for load ${live.loadRef} attached.`} /></Field>
            <div className="footnote secondary">The invoice PDF and the signed proof of delivery are attached. The customer also sees it in Rugo if they book through Rugo.</div>
            <ActionButton className="btn primary large" disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)} onClick={send}><Icon name="send" size={16} />Send invoice</ActionButton>
          </div>
        </Sheet>
      )}
      {pay && (
        <Sheet title="Record payment" onClose={() => setPay(false)}>
          <div className="stack">
            <Field label={`Amount received (balance ${money2(live.balance)})`}><input className="input num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} /></Field>
            <Field label="Method"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{['EFT', 'Cheque', 'Wire', 'Credit card', 'Factoring advance'].map((m) => <option key={m}>{m}</option>)}</select></Field>
            <ActionButton className="btn green large" disabled={!(Number(amt) > 0)} onClick={() => status('paid', { amount: Number(amt), method })}><Icon name="check" size={16} />Save payment</ActionButton>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}

/** Read-only sheet for the customer. */
export function InvoiceView({ inv, onClose }) {
  return (
    <Sheet title={inv.number} onClose={onClose} wide action={<button className="btn small" onClick={printSheet}><Icon name="print" size={14} />Print</button>}>
      <InvoicePaper inv={inv} />
    </Sheet>
  );
}
