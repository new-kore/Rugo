// Builds a single self-contained HTML page of Rugo (backend included) for hosting anywhere, e.g. as an Artifact.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

execSync('npx vite build --mode standalone', { stdio: 'inherit' });
const dir = 'dist-standalone';
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const read = (p) => fs.readFileSync(path.join(dir, p.replace(/^\.\//, '')), 'utf8');
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="(\.\/[^"]+)"[^>]*>/g)].map((m) => read(m[1])).join('\n');
const js = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((m) => read(m[1])).join('\n');
const icon = fs.readFileSync('public/icon.svg', 'utf8');
const out = `<title>Rugo Freight</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Rugo">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Roboto:wght@400;500;700&display=swap">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
fs.writeFileSync(path.join(dir, 'rugo.html'), out);

// A complete web page for static hosting (GitHub Pages serves /docs).
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Rugo — on-demand freight. Request a pickup, get a truck, track it live.">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
${out.replace('<div id="root"></div>', '</head>\n<body>\n<div id="root"></div>')}</body>
</html>
`;
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/index.html', page);
fs.writeFileSync('docs/.nojekyll', '');
// Home-screen icons and manifest for "Add to Home Screen" on iPhone / Android.
for (const f of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) if (fs.existsSync(`public/${f}`)) fs.copyFileSync(`public/${f}`, `docs/${f}`);
fs.writeFileSync('docs/manifest.webmanifest', JSON.stringify({ ...JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8')), start_url: './', scope: './', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }));
console.log(`Wrote ${dir}/rugo.html (${(out.length / 1024).toFixed(0)} KB)`);
