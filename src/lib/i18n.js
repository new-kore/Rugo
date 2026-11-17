// Languages: English, French (Canada) and Spanish.
// The app is written in English; this module swaps every English string on screen for the chosen language.
// It works on the rendered page (text, placeholders, tooltips, labels), so server messages and toasts are
// translated too, and new screens are covered as soon as their strings are in the dictionaries.
// Strings with values use templates: "Pickup moved to {0}" ⇄ "Ramassage déplacé au {0}".
import fr from '../i18n/fr.json';
import es from '../i18n/es.json';

export const LANGS = [
  { code: 'en', label: 'English', locale: 'en-CA' },
  { code: 'fr', label: 'Français', locale: 'fr-CA' },
  { code: 'es', label: 'Español', locale: 'es-MX' },
];
const DICTS = { fr, es };
const LS = 'rugo.lang';

function initial() {
  try { const s = localStorage.getItem(LS); if (LANGS.some((l) => l.code === s)) return s; } catch { /* ignore */ }
  const nav = (typeof navigator !== 'undefined' && navigator.language || 'en').slice(0, 2);
  return nav === 'fr' || nav === 'es' ? nav : 'en';
}

let lang = initial();
const listeners = new Set();
export const getLang = () => lang;
/** Locale for dates, times and numbers. */
export const loc = () => LANGS.find((l) => l.code === lang)?.locale || 'en-CA';
export const onLang = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/* ------------------------------ dictionary ------------------------------ */

const norm = (s) => s.replace(/\s+/g, ' ').trim();
let exact = new Map();
let buckets = new Map(); // first 2 chars of the leading literal → [{ re, out }]
let lead = []; // templates that start with a value
let cache = new Map();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile() {
  exact = new Map(); buckets = new Map(); lead = []; cache = new Map();
  const d = DICTS[lang];
  if (!d) return;
  for (const [en, tr] of Object.entries(d)) {
    if (!tr) continue;
    if (!/\{\d+\}/.test(en)) { exact.set(norm(en), tr); continue; }
    const parts = en.split(/(\{\d+\})/);
    const order = [];
    const src = parts.map((p) => { const m = /^\{(\d+)\}$/.exec(p); if (m) { order.push(Number(m[1])); return '(.*?)'; } return esc(p); }).join('');
    // A template that is only placeholders and punctuation would match anything; skip those.
    if (!/[A-Za-zÀ-ÿ]{2}/.test(en.replace(/\{\d+\}/g, ''))) continue;
    const entry = { re: new RegExp(`^${src}$`, 's'), order, out: tr, len: en.length };
    if (/^\{\d+\}/.test(en)) lead.push(entry);
    else { const k = en.slice(0, 2); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(entry); }
  }
  // Longer templates first: they are more specific.
  for (const list of buckets.values()) list.sort((a, b) => b.len - a.len);
  lead.sort((a, b) => b.len - a.len);
}
compile();

/** Translate one English string (whitespace around it is kept). */
export function t(text) {
  if (lang === 'en' || text == null) return text;
  const s = String(text);
  const core = norm(s);
  if (!core || !/[A-Za-z]/.test(core)) return s;
  let out = cache.get(core);
  if (out === undefined) {
    out = exact.get(core);
    if (out === undefined) out = viaTemplate(core);
    if (out === undefined) out = viaParts(core);
    if (out === undefined) out = null;
    if (cache.size > 5000) cache.clear();
    cache.set(core, out);
  }
  if (out == null) return s;
  const pre = s.match(/^\s*/)[0]; const post = s.match(/\s*$/)[0];
  return pre + out + post;
}

/** "RG-10220 · Looking for carrier" → translate each part around the separators. */
function viaParts(core, depth = 0) {
  if (depth > 2) return undefined;
  for (const sep of [' · ', ' — ', ' → ', ', ', ': ']) {
    if (!core.includes(sep)) continue;
    const parts = core.split(sep);
    let changed = false;
    const outParts = parts.map((x) => { const r = exact.get(norm(x)) ?? viaTemplate(norm(x), depth + 1) ?? viaParts(norm(x), depth + 1); if (r != null) { changed = true; return r; } return x; });
    if (changed) return outParts.join(sep);
  }
  return undefined;
}

function viaTemplate(core, depth = 0) {
  const tryList = (list) => {
    for (const e of list || []) {
      const m = e.re.exec(core);
      if (!m) continue;
      const vals = {}; e.order.forEach((n, i) => { vals[n] = m[i + 1]; });
      // Values can be translatable words themselves (a status, a weekday…).
      return e.out.replace(/\{(\d+)\}/g, (_, n) => { const v = vals[n] ?? ''; if (!/[A-Za-z]{2}/.test(v) || depth > 2) return v; const tv = exact.get(norm(v)) ?? viaTemplate(norm(v), depth + 1) ?? viaParts(norm(v), depth + 1); return tv == null ? v : v.match(/^\s*/)[0] + tv + v.match(/\s*$/)[0]; });
    }
    return undefined;
  };
  return tryList(buckets.get(core.slice(0, 2))) ?? tryList(lead);
}

/* ------------------------------ the page ------------------------------ */

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const origText = new WeakMap(); // Text node → English
const shown = new WeakMap(); // Text node → what we last wrote
const origAttr = new WeakMap(); // Element → { attr: English }
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'svg', 'SVG']);

const skipped = (el) => !el || SKIP.has(el.nodeName) || !!el.closest?.('[data-no-i18n]');

function doText(node) {
  const cur = node.nodeValue;
  if (shown.get(node) !== cur) origText.set(node, cur); // React (or anyone) wrote new English
  const en = origText.get(node);
  if (en == null || skipped(node.parentElement)) return;
  const next = lang === 'en' ? en : t(en);
  if (next !== cur) node.nodeValue = next;
  shown.set(node, next);
}

function doAttrs(el) {
  if (skipped(el)) return;
  let o = origAttr.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    if (!o) { o = {}; origAttr.set(el, o); }
    if (o[`_${a}`] !== cur) o[a] = cur; // changed by the app
    const next = lang === 'en' ? o[a] : t(o[a]);
    if (next !== cur) el.setAttribute(a, next);
    o[`_${a}`] = next;
  }
}

function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 || skipped(root)) return;
  doAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && skipped(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n = tw.nextNode();
  while (n) { if (n.nodeType === 3) doText(n); else doAttrs(n); n = tw.nextNode(); }
}

let observer = null;
/** Start translating the page (call once at start-up). */
export function startI18n() {
  if (typeof document === 'undefined' || observer) return;
  document.documentElement.lang = lang;
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  walk(document.body);
}

/** Switch language everywhere, immediately. */
export function setLang(code) {
  if (!LANGS.some((l) => l.code === code) || code === lang) return;
  lang = code;
  try { localStorage.setItem(LS, code); } catch { /* ignore */ }
  document.documentElement.lang = code;
  compile();
  walk(document.body);
  listeners.forEach((fn) => fn(code));
}
