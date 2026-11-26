(function () {
  try {
    localStorage.removeItem('lune_theme');
    var pref = localStorage.getItem('lune_theme_pref') || 'system';
    var resolved =
      pref === 'light' || pref === 'dark'
        ? pref
        : window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
    document.documentElement.dataset.theme = resolved;
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', resolved === 'light' ? '#F5F5F7' : '#09090B');
  } catch (e) {}
})();
