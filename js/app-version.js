// Populate app version in the footer from /api/version and boot the demo app.
(function () {
  const verEl = document.getElementById('app-version');
  if (verEl) {
    fetch('/api/version')
      .then(function (r) { return r.json(); })
      .then(function (data) { verEl.textContent = 'v' + data.version; })
      .catch(function () { verEl.textContent = 'v2.2-demo'; });
  }

  function bootDemo() {
    try {
      if (typeof TOKEN !== 'undefined') {
        TOKEN = localStorage.getItem('sb_token') || TOKEN;
      }
      if (typeof USER !== 'undefined') {
        USER = JSON.parse(localStorage.getItem('sb_user') || 'null') || USER;
      }
    } catch (e) {}
    if (typeof initApp === 'function') initApp();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootDemo);
  } else {
    bootDemo();
  }
})();
