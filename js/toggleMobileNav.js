window.toggleMobileNav = function (e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      var sb = document.getElementById('sidebar');
      if (!sb) return false;
      var open = !sb.classList.contains('open');
      sb.classList.toggle('open', open);
      var btn = document.getElementById('mobileMenuToggle');
      if (btn) {
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      }
      var icon = document.getElementById('mobileMenuIcon');
      if (icon) {
        icon.classList.toggle('bi-list', !open);
        icon.classList.toggle('bi-x-lg', open);
      }
      return false;
};