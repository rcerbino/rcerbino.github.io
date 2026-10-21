/* Search, type filter and ordering for the publication list. The page is
   complete without JavaScript; this only hides, shows and reorders items. */
(function () {
  var q = document.getElementById('pub-q');
  if (!q) return;
  var groups = document.querySelectorAll('.all-pubs .pub-group');
  var byCites = document.querySelector('.by-cites');
  var count = document.querySelector('.pub-count');
  var items = Array.prototype.slice.call(document.querySelectorAll('.all-pubs .pub-group .pub'));
  items.forEach(function (li) { li._text = li.textContent.toLowerCase().replace(/\s+/g, ' '); });

  function matches(li, type, terms) {
    var okType = type === 'all' || li.dataset.type === type;
    return okType && terms.every(function (t) { return li._text.indexOf(t) !== -1; });
  }

  function apply() {
    var type = document.querySelector('input[name="pub-type"]:checked').value;
    var order = document.querySelector('input[name="pub-order"]:checked').value;
    var terms = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    var shown = 0;

    if (order === 'cites') {
      groups.forEach(function (g) { g.hidden = true; });
      var list = items.filter(function (li) { return matches(li, type, terms); })
        .sort(function (a, b) { return (+b.dataset.cites) - (+a.dataset.cites); });
      byCites.innerHTML = '';
      list.forEach(function (li) {
        var c = li.cloneNode(true);
        c.classList.remove('hidden');
        var venue = c.querySelector('.pub-venue');
        if (venue && li.dataset.year && venue.textContent.indexOf('(' + li.dataset.year + ')') === -1) {
          venue.insertAdjacentText('beforeend', ' (' + li.dataset.year + ')');
        }
        byCites.appendChild(c);
      });
      byCites.hidden = false;
      shown = list.length;
      if (window._altmetric_embed_init) window._altmetric_embed_init(byCites);
    } else {
      byCites.hidden = true;
      groups.forEach(function (g) {
        var inGroup = 0;
        g.querySelectorAll('.pub-list').forEach(function (ol) {
          var inList = 0;
          ol.querySelectorAll('.pub').forEach(function (li) {
            var ok = matches(li, type, terms);
            li.classList.toggle('hidden', !ok);
            if (ok) inList++;
          });
          var head = ol.previousElementSibling;
          if (head && head.classList.contains('year')) head.classList.toggle('hidden', inList === 0);
          inGroup += inList;
        });
        g.hidden = inGroup === 0;
        shown += inGroup;
      });
    }
    var filtered = terms.length || type !== 'all';
    count.textContent = filtered ? shown + (shown === 1 ? ' publication' : ' publications') + ' shown' : '';
  }

  q.addEventListener('input', apply);
  document.querySelectorAll('input[name="pub-type"], input[name="pub-order"]').forEach(function (r) {
    r.addEventListener('change', apply);
  });
})();
