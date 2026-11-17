// Collect every user-visible English string in the app so it can be translated.
// Output: src/i18n/strings.json — { strings: [...], templates: [...] } (templates use {0}, {1} for values).
// Run: node scripts/i18n-extract.mjs
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const files = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (!['standalone', 'i18n'].includes(f)) walk(p); continue; }
    if (/\.(jsx?|mjs)$/.test(f) && !/i18n/.test(f)) files.push(p);
  }
};
walk(path.join(ROOT, 'src'));
// Server text that reaches the screen: labels, errors, notifications, weather.
for (const f of ['constants.js', 'inspections.js', 'pricing.js', 'fleet.js', 'routes.js', 'weather.js', 'chat.js', 'dispatch.js', 'scorecard.js', 'routecheck.js']) {
  const p = path.join(ROOT, 'server', f);
  if (fs.existsSync(p)) files.push(p);
}

const strings = new Set();
const templates = new Set();
const SKIP_ATTR = new Set(['className', 'class', 'style', 'key', 'id', 'name', 'type', 'href', 'src', 'role', 'value', 'inputMode', 'accept', 'capture', 'autoComplete', 'target', 'rel', 'method', 'htmlFor', 'viewBox', 'fill', 'stroke', 'transform', 'tone', 'points', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'icon', 'kind', 'status', 'mode', 'size', 'variant', 'position', 'direction', 'sticky']);
const SKIP_CALLS = new Set(['require', 'import', 'querySelector', 'querySelectorAll', 'getItem', 'setItem', 'removeItem', 'addEventListener', 'removeEventListener', 'getPropertyValue', 'getElementById', 'closest', 'matchMedia', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'importLibrary', 'createElement', 'setAttribute', 'getAttribute', 'fetch', 'api', 'post', 'del', 'patch', 'go', 'find', 'id', 'publish', 'publishRemove', 'match', 'test', 'replace', 'split', 'join', 'startsWith', 'endsWith', 'includes', 'indexOf', 'padStart', 'on', 'off', 'once', 'route', 'get', 'set', 'use', 'listen', 'classList', 'add', 'remove', 'toggle', 'contains']);

const looksLikeText = (s, word = false) => {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length < 2 || !/[A-Za-zÀ-ÿ]{2}/.test(t)) return null;
  if (word && /^[a-z]{3,}( [a-z]{2,})*$/.test(t)) return t; // plain lowercase words shown on screen
  if (/^[a-z0-9_.:;\-/#?=&%() ]+$/.test(t) && !/\s[a-z]{2,}\s/.test(t) && /[:;]/.test(t)) return null; // inline CSS
  if (/^[a-z0-9_.:\-/#?=&%]+$/.test(t)) return null; // keys, class names, ids, urls
  if (/^(https?:|data:|\/|#|\.|var\(|rgba?\(|hsl|calc\(|M\d|m\d)/.test(t)) return null;
  if (/^[\w-]+(\s[\w-]+)*$/.test(t) && /[-_]/.test(t) && !/\s/.test(t)) return null;
  if (/[{}<>]|=>|\$\{|px\b|\bvar\(|;\S/.test(t)) return null;
  if (/^[A-Z_]+$/.test(t)) return null; // CONSTANTS
  if (/^(GET|POST|PATCH|DELETE|PUT)$/.test(t)) return null;
  if (/^(en|fr|es)-[A-Z]{2}$/.test(t)) return null;
  if (/^[a-z]+([A-Z][a-z]+)+$/.test(t)) return null; // camelCase keys
  if (/^\d/.test(t) && !/[a-z]{3}/i.test(t)) return null;
  if (/^(sans-serif|monospace|Helvetica|Arial|Menlo|-apple-system)/.test(t)) return null;
  return t;
};

const callName = (p) => {
  const c = p.parentPath;
  if (!c || !(c.isCallExpression() || c.isNewExpression())) return null;
  const cal = c.node.callee;
  return cal.type === 'Identifier' ? cal.name : cal.type === 'MemberExpression' && cal.property?.name;
};
const attrName = (p) => {
  let q = p.parentPath;
  if (q?.isJSXExpressionContainer()) q = q.parentPath;
  return q?.isJSXAttribute() ? q.node.name.name : null;
};
const objKey = (p) => {
  const q = p.parentPath;
  if (q?.isObjectProperty() && q.node.value === p.node) return q.node.key.name || q.node.key.value;
  return null;
};
const SKIP_KEYS = new Set(['key', 'value', 'id', 'icon', 'tone', 'kind', 'role', 'slot', 'status', 'type', 'className', 'color', 'background', 'path', 'section', 'unit', 'mode', 'severity', 'equipment', 'source', 'fuelType', 'payType', 'demo', 'region', 'email', 'phone', 'url', 'item', 'on', 'cur', 'currency', 'locale', 'timezone', 'timeZone', 'wind_speed_unit', 'timeformat', 'current', 'hourly', 'latitude', 'longitude', 'forecast_days', 'Authorization', 'authorization', 'Content-Type', 'Cache-Control', 'Connection', 'X-Accel-Buffering', 'credentials', 'cache', 'fontFamily', 'transform', 'transition', 'border', 'boxShadow', 'width', 'height', 'gridTemplateColumns', 'alignItems', 'justifyContent', 'textAlign', 'fontWeight', 'fontSize', 'margin', 'padding', 'display', 'cursor', 'flex', 'gap', 'top', 'left', 'right', 'bottom', 'position', 'zIndex', 'opacity', 'overflow', 'whiteSpace', 'letterSpacing', 'lineHeight', 'gridColumn', 'transformOrigin', 'animationDelay', 'stroke', 'fill', 'strokeColor', 'mapId', 'colorScheme', 'gestureHandling', 'subdomains', 'attribution', 'by', 'name', 'city', 'address', 'contact', 'make', 'model', 'plate', 'vin', 'description']);

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try { ast = parse(code, { sourceType: 'module', plugins: ['jsx'] }); } catch (e) { console.warn('skip', file, e.message); continue; }
  const server = file.includes(`${path.sep}server${path.sep}`);
  traverse(ast, {
    JSXText(p) { const t = looksLikeText(p.node.value, true); if (t) strings.add(t); },
    StringLiteral(p) {
      if (p.parentPath.isImportDeclaration() || p.parentPath.isExportNamedDeclaration() || p.parentPath.isExportAllDeclaration()) return;
      const a = attrName(p); if (a && SKIP_ATTR.has(a)) return;
      const cn = callName(p); if (cn && SKIP_CALLS.has(cn)) return;
      const k = objKey(p); if (k && SKIP_KEYS.has(k)) return;
      if (p.parentPath.isBinaryExpression() && ['===', '!==', '==', '!='].includes(p.parentPath.node.operator)) return;
      if (p.parentPath.isSwitchCase() || p.parentPath.isObjectProperty() && p.parentPath.node.key === p.node) return;
      if (server && !/\s/.test(p.node.value) && !/^[A-Z]/.test(p.node.value)) return;
      const shown = p.parentPath.isConditionalExpression() || p.parentPath.isLogicalExpression() || p.parentPath.isJSXExpressionContainer();
      const t = looksLikeText(p.node.value, shown && !server); if (t) strings.add(t);
    },
    TemplateLiteral(p) {
      if (p.parentPath.isTaggedTemplateExpression()) return;
      const a = attrName(p); if (a && SKIP_ATTR.has(a)) return;
      const k = objKey(p); if (k && SKIP_KEYS.has(k)) return;
      const cn = callName(p); if (cn && SKIP_CALLS.has(cn)) return;
      const qs = p.node.quasis.map((q) => q.value.cooked ?? q.value.raw);
      if (!qs.some((q) => /[A-Za-z]{3}/.test(q))) return;
      if (qs.some((q) => /[<>{}]|;\S|var\(|url\(|https?:|^\/|px\b/.test(q))) return;
      if (p.node.expressions.length === 0) { const t = looksLikeText(qs[0]); if (t) strings.add(t); return; }
      let tpl = '';
      qs.forEach((q, i) => { tpl += q; if (i < p.node.expressions.length) tpl += `{${i}}`; });
      tpl = tpl.replace(/\s+/g, ' ').trim();
      // Each literal piece is also a string on its own (common when a value is empty).
      if (/[A-Za-z]{3}/.test(tpl.replace(/\{\d+\}/g, ''))) templates.add(tpl);
    },
  });
}

const out = { strings: [...strings].sort(), templates: [...templates].sort() };
fs.mkdirSync(path.join(ROOT, 'src/i18n'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/i18n/strings.json'), JSON.stringify(out, null, 1));
console.log(`${out.strings.length} strings, ${out.templates.length} templates`);
