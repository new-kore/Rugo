// Read a fuel receipt and a pump display photo in the browser (Tesseract OCR).
// Pulls out litres, price per litre, subtotal, sales tax (GST/HST/QST/PST) and total.
// Whatever is read is shown to the driver to confirm; changes are flagged to the office.
import { loadTesseract } from './licenceScan.js';

const num = (s) => {
  if (s == null) return null;
  const v = Number(String(s).replace(/\s/g, '').replace(/,(\d{1,3})$/, '.$1').replace(/[^\d.]/g, ''));
  return Number.isFinite(v) && v > 0 ? v : null;
};
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
const MONEY = /\$?\s*(\d{1,5}[.,]\d{2})(?!\d)/g;
const BRANDS = ['Petro-Canada', 'Esso', 'Shell', 'Pilot', 'Flying J', 'Husky', 'Ultramar', 'Irving', 'Chevron', 'Mobil', 'Pioneer', 'Couche-Tard', 'Circle K', 'Canadian Tire', 'Fas Gas', 'Co-op', 'Love’s', "Love's", 'TA', 'Petro-Pass'];

/** Pull the numbers out of receipt text. */
export function parseReceipt(text) {
  const up = String(text || '').toUpperCase().replace(/\r/g, '');
  const lines = up.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = { tax: {} };
  const amountsIn = (l) => [...l.matchAll(MONEY)].map((m) => num(m[1])).filter((v) => v != null);

  // Litres: "412.350 L", "VOLUME 412.350", "QTY 412.35 LTR", "LITRES: 412.35"
  for (const l of lines) {
    let m = /(\d{1,4}[.,]\d{1,3})[ \t]*(?:L|LT|LTR|LTRS|LITRES?|LITERS?)\b/.exec(l)
      || /(?:VOL(?:UME)?|QTY|QUANTITY|LITRES?|LITERS?|LTRS?)\D{0,6}(\d{1,4}[.,]\d{1,3})/.exec(l);
    if (m && !out.litres) out.litres = num(m[1]);
    // Price per litre: "@ 1.649", "1.649 $/L", "PRICE/L 1.649", "PPU 1.649", "164.9 ¢/L"
    m = /@\s*\$?(\d[.,]\d{3})/.exec(l) || /(\d[.,]\d{3})\s*\$?\s*\/\s*(?:L|LT|LTR)\b/.exec(l) || /(?:PRICE|PPU|PRIX|UNIT)\D{0,10}(\d[.,]\d{2,3})/.exec(l);
    if (m && !out.pricePerL) out.pricePerL = num(m[1]);
    m = /(\d{3}[.,]\d)\s*(?:¢|C)\s*\/\s*L/.exec(l);
    if (m && !out.pricePerL) out.pricePerL = r3(num(m[1]) / 100);
    // Taxes
    const amt = amountsIn(l).at(-1);
    if (amt != null) {
      if (/\b(HST|TVH)\b/.test(l)) out.tax.hst = amt;
      else if (/\b(GST|TPS)\b/.test(l)) out.tax.gst = amt;
      else if (/\b(QST|TVQ)\b/.test(l)) out.tax.qst = amt;
      else if (/\b(PST|RST)\b/.test(l)) out.tax.pst = amt;
      else if (/SUB\s*-?\s*TOTAL|SOUS-TOTAL/.test(l)) out.subtotal = amt;
      else if (/\bTOTAL\b|AMOUNT DUE|MONTANT|\bSALE\b|PURCHASE|ACHAT/.test(l)) out.total = amt;
    }
  }
  const words = (b) => new RegExp(`(^|[^A-Z])${b.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z]|$)`);
  out.station = [...BRANDS].sort((a, b) => b.length - a.length).find((b) => words(b).test(up)) || null;
  if (out.station === 'Pilot' || out.station === 'Flying J') out.station = 'Pilot Flying J';
  const taxSum = Object.values(out.tax).reduce((a, v) => a + v, 0);
  out.taxTotal = taxSum ? r2(taxSum) : null;
  // Fill gaps from what we have.
  if (!out.total) { const all = lines.flatMap(amountsIn); if (all.length) out.total = Math.max(...all); }
  if (!out.subtotal && out.total && out.taxTotal) out.subtotal = r2(out.total - out.taxTotal);
  if (!out.litres && out.total && out.pricePerL) out.litres = r2((out.subtotal || out.total) / out.pricePerL);
  if (!out.pricePerL && out.litres && (out.subtotal || out.total)) out.pricePerL = r3((out.subtotal || out.total) / out.litres);
  return out;
}

/** Pump display: dollars (2 decimals) and litres (3 decimals, or the number next to "L"/"LITRES"/"VOLUME"). */
export function parsePump(text) {
  const up = String(text || '').toUpperCase();
  const out = {};
  let m = /(\d{1,4}[.,]\d{2,3})[ \t]*(?:L|LITRES?|LITERS?|VOL)\b/.exec(up) || /(?:LITRES?|LITERS?|VOLUME|VOL)[^\d\n]{0,8}(\d{1,4}[.,]\d{2,3})/.exec(up);
  if (m) out.litres = num(m[1]);
  m = /(?:SALE|\$|AMOUNT|TOTAL|MONTANT)[^\d\n]{0,8}(\d{1,5}[.,]\d{2})(?!\d)/.exec(up);
  if (m) out.amount = num(m[1]);
  if (!out.litres || !out.amount) {
    const nums = [...up.matchAll(/(\d{1,5}[.,]\d{2,3})(?!\d)/g)].map((x) => ({ v: num(x[1]), dec: x[1].split(/[.,]/)[1].length }));
    if (!out.litres) out.litres = nums.find((x) => x.dec === 3)?.v ?? null;
    if (!out.amount) out.amount = nums.filter((x) => x.dec === 2).map((x) => x.v).sort((a, b) => b - a)[0] ?? null;
  }
  return out;
}

async function ocr(dataUrl, onProgress) {
  const T = await loadTesseract();
  const { data } = await T.recognize(dataUrl, 'eng+fra', { logger: (m) => m.status === 'recognizing text' && onProgress?.(m.progress) });
  return data.text || '';
}

export async function scanReceipt(dataUrl, onProgress) {
  const text = await ocr(dataUrl, onProgress);
  return { ...parseReceipt(text), raw: text };
}
export async function scanPump(dataUrl, onProgress) {
  const text = await ocr(dataUrl, onProgress);
  return { ...parsePump(text), raw: text };
}
