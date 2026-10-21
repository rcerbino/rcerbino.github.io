/* Search and type filter for the publication list. Works on the static HTML,
   so the page is complete without JavaScript. */
(function () {
  var q = document.getElementById('pub-q');
  if (!q) return;
  var radios = document.querySelectorAll('input[name="pub-type"]');
  var groups = document.querySelectorAll('.all-pubs .pub-group');
  var count = document.querySelector('.pub-count');
  var items = document.querySelectorAll('.all-pubs .pub');
  items.forEach(function (li) { li._text = li.textContent.toLowerCase().replace(/\s+/g, ' '); });

  function apply() {
    var type = document.querySelector('input[name="pub-type"]:checked').value;
    var terms = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    var shown = 0;
    groups.forEach(function (g) {
      var groupOk = type === 'all' || g.dataset.group === type;
      var inGroup = 0;
      g.querySelectorAll('.pub-list').forEach(function (list) {
        var inList = 0;
        list.querySelectorAll('.pub').forEach(function (li) {
          var ok = groupOk && terms.every(function (t) { return li._text.indexOf(t) !== -1; });
          li.classList.toggle('hidden', !ok);
          if (ok) inList++;
        });
        var head = list.previousElementSibling;
        if (head && head.classList.contains('year')) head.classList.toggle('hidden', inList === 0);
        inGroup += inList;
      });
      g.classList.toggle('hidden', inGroup === 0);
      shown += inGroup;
    });
    var filtered = terms.length || type !== 'all';
    count.textContent = filtered ? shown + (shown === 1 ? ' publication' : ' publications') + ' shown' : '';
  }
  q.addEventListener('input', apply);
  radios.forEach(function (r) { r.addEventListener('change', apply); });
})();
