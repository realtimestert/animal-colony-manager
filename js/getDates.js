// Site footer year + last-modified. Safe if #year / #lastModified are missing.
(function () {
  function fillFooterDates() {
    try {
      var yearEl = document.getElementById('year');
      if (yearEl) {
        yearEl.textContent = String(new Date().getFullYear());
      }

      var modifiedEl = document.getElementById('lastModified');
      if (!modifiedEl) return;

      var raw = document.lastModified;
      if (!raw || raw === '01/01/1970 00:00:00') {
        modifiedEl.textContent = '';
        return;
      }

      var parsed = new Date(raw);
      if (isNaN(parsed.getTime())) {
        modifiedEl.textContent = '';
        return;
      }

      modifiedEl.textContent = 'Last Modified: ' + parsed.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      // Footer helpers must never break the SPA.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillFooterDates);
  } else {
    fillFooterDates();
  }
})();
