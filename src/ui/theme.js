// Script pequeño ejecutado antes del CSS para evitar un destello del tema opuesto.
(() => {
  const key = 'cuotas-theme';
  const choices = ['light', 'dark'];
  let preference = 'light';
  try { const saved = localStorage.getItem(key); if (choices.includes(saved)) preference = saved; } catch { /* El tema funciona sin almacenamiento. */ }
  function apply() {
    document.documentElement.dataset.theme = preference;
    const select = document.getElementById('themeSelect');
    if (select) select.value = preference;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = document.documentElement.dataset.theme === 'dark' ? '#080f1c' : '#f0f5fc';
  }
  apply();
  window.addEventListener('storage', event => {
    if (event.key === key) { preference = choices.includes(event.newValue) ? event.newValue : 'light'; apply(); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('themeSelect').addEventListener('change', event => {
      preference = event.target.value;
      try { localStorage.setItem(key, preference); } catch { /* No bloquear la app. */ }
      apply();
    });
  });
})();
