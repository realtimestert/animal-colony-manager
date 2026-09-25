(function () {
      var html = document.documentElement;
      function storedTheme() {
        try {
          var s = localStorage.getItem('theme');
          if (s === 'dark' || s === 'light') return s;
        } catch (e) {}
        return null;
      }
      function currentTheme() {
        var attr = html.getAttribute('data-theme') || html.getAttribute('data-bs-theme');
        if (attr === 'dark' || attr === 'light') return attr;
        return storedTheme() || 'light';
      }
      function applyTheme(theme) {
        var dark = theme === 'dark';
        html.setAttribute('data-theme', dark ? 'dark' : 'light');
        html.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
        html.style.colorScheme = dark ? 'dark' : 'light';
        html.classList.toggle('theme-dark', dark);
        html.classList.toggle('theme-light', !dark);
        try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
        var toggle = document.getElementById('darkModeToggle');
        if (!toggle) return;
        var icon = toggle.querySelector('i');
        var text = toggle.querySelector('span');
        if (icon) icon.className = dark ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
        if (text) text.textContent = dark ? 'Light Mode' : 'Dark Mode';
        toggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
      }
      window.applyTheme = applyTheme;
      window.toggleTheme = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
        return false;
      };
      applyTheme(storedTheme() || currentTheme());
    })();