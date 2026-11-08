// Read a driver's licence photo in the browser (Tesseract OCR) and pull out name, number, class and expiry.
// The result is always shown to a person to confirm. Where outside scripts are blocked, it reports that and the
// form is filled in by hand.
let loading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('OCR unavailable')));
    s.onerror = () => { loading = null; reject(new Error('OCR unavailable')); };
    document.head.appendChild(s);
  });
  return loading;
}

const pad = (n) => String(n).padStart(2, '0');
function toISO(y, m, d) {
  const Y = Number(y < 100 ? 2000 + Number(y) : y); const M = Number(m); const D = Number(d);
  if (M < 1 || M > 12 || D < 1 || D > 31 || Y < 1990 || Y > 2100) return null;
  return `${Y}-${pad(M)}-${pad(D)}`;
}

export function parseLicence(text) {
  const raw = text.replace(/\r/g, '');
  const up = raw.toUpperCase();
  const lines = up.split('\n').map((l) => l.trim()).filter(Boolean);

  // Dates: 2028/05/14, 2028-05-14, 14/05/2028, 05/14/2028, 2028 MAY 14
  const months = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  const found = [];
  const push = (iso, idx) => iso && found.push({ iso, idx });
  for (const m of up.matchAll(/(\d{4})[/.\- ](\d{1,2})[/.\- ](\d{1,2})/g)) push(toISO(m[1], m[2], m[3]), m.index);
  for (const m of up.matchAll(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/g)) push(Number(m[1]) > 12 ? toISO(m[3], m[2], m[1]) : toISO(m[3], m[1], m[2]), m.index);
  for (const m of up.matchAll(/(\d{4})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\w*\s*(\d{1,2})/g)) push(toISO(m[1], months[m[2]], m[3]), m.index);
  // Prefer a date right after "EXP"; otherwise the latest future date.
  let expiry = null;
  const expAt = up.search(/\bEXP|EXPIRY|EXPIRES|4B\b/);
  if (expAt >= 0) expiry = found.filter((f) => f.idx >= expAt).sort((a, b) => a.idx - b.idx)[0]?.iso || null;
  if (!expiry) expiry = found.map((f) => f.iso).filter((d) => new Date(d) > new Date()).sort().pop() || null;

  // Licence number: Ontario A1234-56789-01234, otherwise a long letter+digit token
  const num = up.match(/\b[A-Z]\d{4}[- ]?\d{5}[- ]?\d{5}\b/)?.[0] || up.match(/\b(?:DL|NO|NUMBER|4D)[:.\s]*([A-Z0-9-]{6,20})/)?.[1] || null;

  // Class (AZ, DZ, G, A, B…)
  const cls = up.match(/\bCLASS[:.\s]*([A-Z]{1,2})\b/)?.[1] || up.match(/\b(AZ|DZ|CZ|BZ)\b/)?.[1] || null;

  // Name: "LAST,FIRST MIDDLE" (Ontario) or lines after 1/2 field numbers (US-style)
  let name = null;
  const comma = lines.find((l) => /^[A-Z' -]{2,},\s*[A-Z' -]{2,}$/.test(l));
  if (comma) {
    const [last, first] = comma.split(',').map((x) => x.trim());
    name = `${first.split(/\s+/)[0]} ${last}`;
  } else {
    const ln = up.match(/(?:^|\n)\s*1\s+([A-Z' -]{2,})/)?.[1]; const fn = up.match(/(?:^|\n)\s*2\s+([A-Z' -]{2,})/)?.[1];
    if (ln && fn) name = `${fn.trim().split(/\s+/)[0]} ${ln.trim()}`;
  }
  const title = (s) => s && s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase());
  return { name: title(name), licenseNumber: num, licenseClass: cls, expiry };
}

/** Scan an image data URL. onProgress(0..1). Resolves to the parsed fields plus the raw text. */
export async function scanLicence(dataUrl, onProgress) {
  const T = await loadTesseract();
  const { data } = await T.recognize(dataUrl, 'eng', { logger: (m) => m.status === 'recognizing text' && onProgress?.(m.progress) });
  return { ...parseLicence(data.text || ''), text: data.text || '' };
}
