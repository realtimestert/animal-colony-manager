// Mobile menu helpers. Open/close is window.toggleMobileNav
// from scripts/toggleMobileNav.js (also loaded in <head>).
(function () {
  if (window.__sanusBurgerBound) return;
  window.__sanusBurgerBound = true;

  function isMobile() {
    return window.matchMedia('(max-width: 991.98px)').matches;
  }

  function setOpen(open) {
    if (typeof window.toggleMobileNav === 'function') {
      var sb = document.getElementById('sidebar');
      if (!sb) return;
      var currentlyOpen = sb.classList.contains('open');
      if (!!open === currentlyOpen) return;
      window.toggleMobileNav();
      return;
    }
    var sb = document.getElementById('sidebar');
    if (!sb) return;
    sb.classList.toggle('open', !!open);
  }

  document.addEventListener('click', function (e) {
    var sb = document.getElementById('sidebar');
    if (!sb || !isMobile() || !sb.classList.contains('open')) return;
    // Button uses onclick="toggleMobileNav(event)" — do not toggle again here.
    if (e.target.closest('#mobileMenuToggle')) return;
    if (e.target.closest('#navLinks .nav-link')) {
      setOpen(false);
      return;
    }
    if (!e.target.closest('#sidebar')) setOpen(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });

  window.addEventListener('resize', function () {
    if (!isMobile()) setOpen(false);
  });
})();
