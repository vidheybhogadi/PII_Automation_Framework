/* PII Sentinel — applies the saved theme before first paint (no flash). */
// Apply the saved theme before first paint (no flash). Storage may be unavailable — ignore errors.
(function () {
  var mode = 'system',
    accent = 'azure';
  try {
    mode = localStorage.getItem('pii-sentinel:theme') || 'system';
    accent = localStorage.getItem('pii-sentinel:accent') || 'azure';
  } catch (e) {
    /* storage unavailable — fall back to defaults */ void e;
  }
  var dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  if (/[?&]mode=print/.test(location.search)) {
    dark = false;
  }
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-accent', accent);
})();
