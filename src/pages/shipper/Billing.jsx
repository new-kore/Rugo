import { InvoiceView, statusOf } from '../../components/InvoiceEditor.jsx';
import { useMemo, useState } from 'react';
import { PageHead, Stat, Empty } from '../../components/ui.jsx';
import { InvoiceDoc } from '../../components/LoadBits.jsx';
import BarChart from '../../components/BarChart.jsx';
import { useStore, useIndex } from '../../lib/store.jsx';
import { money, money2, km, date, placeShort } from '../../lib/format.js';

export default function Billing() {
  const { data } = useStore();
  const idx = useIndex();
  const [open, setOpen] = useState(null);
  const [cOpen, setCOpen] = useState(null);
  const fromCarriers = (data.invoices || []).slice().sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
  const invoiced = data.loads.filter((l) => l.invoice).sort((a, b) => b.invoice.issuedAt - a.invoice.issuedAt);
  const total = invoiced.reduce((a, l) => a + l.invoice.total, 0);
  const due = invoiced.filter((l) => !l.invoice.paid).reduce((a, l) => a + l.invoice.total, 0);
  const kms = invoiced.reduce((a, l) => a + l.metrics.loadedKm, 0);

  const weekly = useMemo(() => {
    const weeks = [];
    for (let i = 5; i >= 0; i--) {
      const end = Date.now() - i * 7 * 864e5;
      const start = end - 7 * 864e5;
      const v = invoiced.filter((l) => l.invoice.issuedAt > start && l.invoice.issuedAt <= end).reduce((a, l) => a + l.invoice.total, 0);
      weeks.push({ label: date(start), full: `Week of ${date(start)}`, value: Math.round(v) });
    }
    return weeks;
  }, [invoiced]);

  return (
    <div className="page">
      <PageHead title="Billing" sub="Invoices are created automatically when a load is delivered." />
      <div className="grid grid-4">
        <Stat icon="receipt" k="Invoiced" v={money(total)} d={`${invoiced.length} invoices`} />
        <Stat icon="clock" tone="orange" k="Open balance" v={money(due)} d="Net 30" />
        <Stat icon="route" tone="indigo" k="Average per km" v={money2(kms ? invoiced.reduce((a, l) => a + l.invoice.subtotal, 0) / kms : 0)} d="Before tax" />
        <Stat icon="truck" tone="green" k="Kilometres billed" v={Math.round(kms).toLocaleString()} d="From GPS" />
      </div>
      <div className="card pad-lg" style={{ marginTop: 20 }}>
        <div className="headline">Weekly spend</div>
        <div className="footnote secondary" style={{ marginBottom: 10 }}>Invoice totals incl. tax, last 6 weeks</div>
        <BarChart data={weekly} format={(v, axis) => (axis ? `$${Math.round(v / 1000)}k` : money(v))} highlightLast />
      </div>
      {fromCarriers.length > 0 && (
        <>
          <div className="section-header">Invoices from carriers</div>
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Invoice</th><th>Work order</th><th>Carrier</th><th>Load</th><th>Due</th><th className="r">Total</th><th>Status</th></tr></thead>
              <tbody>
                {fromCarriers.map((x) => (
                  <tr key={x.id} className="click" onClick={() => setCOpen(x)}>
                    <td className="mono">{x.number}</td><td className="mono">{x.workOrder}</td><td>{x.from.name}</td><td className="mono">{x.loadRef}</td>
                    <td>{x.terms ? date(x.dueDate) : 'On receipt'}</td><td className="r">{money2(x.balance > 0 ? x.balance : x.total)}</td>
                    <td><span className={`pill ${statusOf(x).tone}`}>{statusOf(x).label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="section-header">Invoices</div>
      <div className="card table-wrap">
        {invoiced.length === 0 ? <Empty icon="receipt" title="No invoices yet">They appear here after your first delivery.</Empty> : (
          <table className="table">
            <thead><tr><th>Invoice</th><th>Date</th><th>Route</th><th>Carrier</th><th className="r">km</th><th className="r">Total</th><th>Status</th></tr></thead>
            <tbody>
              {invoiced.map((l) => (
                <tr key={l.id} className="click" onClick={() => setOpen(l)}>
                  <td className="mono">{l.invoice.number}</td>
                  <td>{date(l.invoice.issuedAt)}</td>
                  <td>{placeShort(l.pickup)} → {placeShort(l.dropoff)}</td>
                  <td>{idx.companies[l.carrierId]?.name}</td>
                  <td className="r">{km(l.metrics.loadedKm)}</td>
                  <td className="r">{money2(l.invoice.total)}</td>
                  <td><span className={`pill ${l.invoice.paid ? 'green' : 'orange'}`}>{l.invoice.paid ? 'Paid' : 'Open'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {cOpen && <InvoiceView inv={cOpen} onClose={() => setCOpen(null)} />}
      {open && <InvoiceDoc load={open} company={idx.companies[open.carrierId]} shipper={idx.companies[open.shipperId]} onClose={() => setOpen(null)} />}
    </div>
  );
}
