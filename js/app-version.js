// Populate app version in the footer from /api/version
(function () {
  const verEl = document.getElementById('app-version');
  if (!verEl) return;

  fetch('/api/version')
    .then(r => r.json())
    .then(data => {
      verEl.textContent = 'v' + data.version;
    })
    .catch(() => {
      verEl.textContent = '';
    });
})();