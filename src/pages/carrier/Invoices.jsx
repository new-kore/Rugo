// Carrier invoices: drafts waiting for review, sent, paid and overdue.
import { useMemo, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { Segmented, Empty } from '../../components/ui.jsx';
import { KpiTile } from '../../components/Charts.jsx';
import InvoiceEditor, { statusOf, isOverdue } from '../../components/InvoiceEditor.jsx';
import { useStore } from '../../lib/store.jsx';
import { money, money2, date } from '../../lib/format.js';

export default function Invoices() {
  const { data } = useStore();
  const [tab, setTab] = useState('draft');
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const all = useMemo(() => (data.invoices || []).slice().sort((a, b) => b.issueDate - a.issueDate), [data.invoices]);
  const drafts = all.filter((x) => x.status === 'draft');
  const unpaid = all.filter((x) => ['sent', 'partial'].includes(x.status));
  const overdue = unpaid.filter(isOverdue);
  const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
  const paidMonth = all.filter((x) => x.paidAt >= m0.getTime());
  const detention = all.filter((x) => x.status !== 'void').reduce((a, x) => a + x.lines.filter((l) => l.kind === 'detention').reduce((s, l) => s + l.qty * l.rate, 0), 0);
  const list = { draft: drafts, unpaid, paid: all.filter((x) => x.status === 'paid'), all }[tab]
    .filter((x) => !q || `${x.number} ${x.workOrder} ${x.loadRef} ${x.billTo.name}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <div className="dkpis" style={{ marginBottom: 16 }}>
        <KpiTile icon={<Icon name="doc" size={20} />} tone="orange" k="To review" v={drafts.length} d={drafts.length ? `${money(drafts.reduce((a, x) => a + x.total, 0))} ready to send` : 'all sent'} alert={drafts.length > 0} onClick={() => setTab('draft')} />
        <KpiTile icon={<Icon name="receipt" size={20} />} tone="blue" k="Waiting for payment" v={money(unpaid.reduce((a, x) => a + x.balance, 0))} d={`${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'}`} onClick={() => setTab('unpaid')} />
        <KpiTile icon={<Icon name="warning" size={20} />} tone="red" k="Overdue" v={money(overdue.reduce((a, x) => a + x.balance, 0))} d={`${overdue.length} past due date`} alert={overdue.length > 0} onClick={() => setTab('unpaid')} />
        <KpiTile icon={<Icon name="checkCircle" size={20} />} tone="green" k="Paid this month" v={money(paidMonth.reduce((a, x) => a + x.paidAmount, 0))} d={`${paidMonth.length} invoices`} onClick={() => setTab('paid')} />
        <KpiTile icon={<Icon name="clock" size={20} />} tone="purple" k="Detention billed" v={money(detention)} d="from dock timestamps" />
      </div>

      <div className="row between wrap" style={{ gap: 8, marginBottom: 12 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'draft', label: `To review · ${drafts.length}` }, { value: 'unpaid', label: `Sent · ${unpaid.length}` }, { value: 'paid', label: 'Paid' }, { value: 'all', label: 'All' }]} />
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search invoice, WO, load or customer" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {list.length === 0 ? (
        <div className="card"><Empty icon="receipt" title={tab === 'draft' ? 'Nothing to review' : 'No invoices here'}>{tab === 'draft' ? 'A draft invoice appears here the moment a receiver signs for a load.' : 'Invoices show up here as you send them.'}</Empty></div>
      ) : (
        <div className="card inv-list">
          <div className="inv-row head"><span>Invoice</span><span>Work order</span><span>Customer</span><span>Load</span><span>Date</span><span className="num">Total</span><span>Status</span></div>
          {list.map((x) => {
            const st = statusOf(x);
            return (
              <button key={x.id} className="inv-row" onClick={() => setOpen(x)}>
                <span className="mono" style={{ fontWeight: 600 }}>{x.number}</span>
                <span className="mono secondary">{x.workOrder}</span>
                <span className="truncate">{x.billTo.name}</span>
                <span className="mono secondary">{x.loadRef}</span>
                <span className="secondary">{date(x.issueDate)}{['sent', 'partial'].includes(x.status) && <span className="inv-due"> · due {date(x.dueDate)}</span>}</span>
                <span className="num" style={{ fontWeight: 600 }}>{money2(x.total)}</span>
                <span><span className={`pill ${st.tone}`}>{st.label}</span></span>
              </button>
            );
          })}
        </div>
      )}
      {open && <InvoiceEditor inv={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
