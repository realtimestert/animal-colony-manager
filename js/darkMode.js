// Theme functions live in scripts/theme.js. This file only refreshes the
// button label after login shows the sidebar.
(function () {
  function sync() {
    if (typeof window.applyTheme !== 'function') return;
    var theme = 'light';
    var html = document.documentElement;
    try {
      var stored = localStorage.getItem('theme');
      if (stored === 'dark' || stored === 'light') theme = stored;
      else if (html.getAttribute('data-theme') === 'dark') theme = 'dark';
    } catch (_) {
      if (html.getAttribute('data-theme') === 'dark') theme = 'dark';
    }
    window.applyTheme(theme);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync);
  } else {
    sync();
  }
})();
