/* Cookie consent for Google Analytics.
   Analytics loads only after the visitor clicks Accept. The choice is kept in
   this browser (localStorage) and can be changed with "Cookie settings" in the
   footer. Declining after accepting stops measurement and removes the cookies. */
(function () {
  var me = document.currentScript;
  var id = me && me.dataset.ga;
  var box = document.querySelector('.consent');
  if (!id || !box) return;
  var KEY = 'analytics-consent';

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  var loaded = false;
  function load() {
    if (loaded) return;
    loaded = true;
    window['ga-disable-' + id] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', id);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
  }

  function stop() {
    window['ga-disable-' + id] = true;
    var host = location.hostname.split('.');
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (name === '_ga' || name.indexOf('_ga_') === 0) {
        for (var i = 0; i < host.length - 1; i++) {
          var d = host.slice(i).join('.');
          document.cookie = name + '=; Max-Age=0; path=/; domain=.' + d;
        }
        document.cookie = name + '=; Max-Age=0; path=/';
      }
    });
  }

  function show() { box.hidden = false; }
  function hide() { box.hidden = true; }

  box.addEventListener('click', function (e) {
    var v = e.target && e.target.getAttribute('data-consent');
    if (!v) return;
    write(v);
    hide();
    if (v === 'granted') load(); else stop();
  });
  document.querySelectorAll('[data-consent-open]').forEach(function (b) {
    b.addEventListener('click', show);
  });

  var choice = read();
  if (choice === 'granted') load();
  else if (choice !== 'denied') show();
})();
