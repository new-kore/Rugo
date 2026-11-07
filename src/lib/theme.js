/** White by default. 'dark' and 'auto' (follow the device) are optional. */
export function applyTheme(pref) {
  const v = pref || 'light';
  const dark = v === 'dark' || (v === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
