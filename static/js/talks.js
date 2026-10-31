/* Search and kind filter for the list of talks. The page is complete
   without JavaScript; this only hides and shows items. */
(function () {
  var q = document.getElementById('talk-q');
  if (!q) return;
  var lists = document.querySelectorAll('.all-talks .talk-list');
  var count = document.querySelector('.talk-filter .pub-count');
  var items = document.querySelectorAll('.all-talks .talk');
  items.forEach(function (li) {
    var year = li.parentNode.previousElementSibling;
    li._text = ((year ? year.textContent : '') + ' ' + li.textContent).toLowerCase().replace(/\s+/g, ' ');
  });

  function apply() {
    var group = document.querySelector('input[name="talk-group"]:checked').value;
    var terms = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    var shown = 0;
    lists.forEach(function (ol) {
      var inList = 0;
      ol.querySelectorAll('.talk').forEach(function (li) {
        var ok = (group === 'all' || li.dataset.group === group) &&
          terms.every(function (t) { return li._text.indexOf(t) !== -1; });
        li.classList.toggle('hidden', !ok);
        if (ok) inList++;
      });
      ol.hidden = inList === 0;
      var head = ol.previousElementSibling;
      if (head && head.classList.contains('year')) head.classList.toggle('hidden', inList === 0);
      shown += inList;
    });
    var filtered = terms.length || group !== 'all';
    count.textContent = filtered ? shown + (shown === 1 ? ' talk' : ' talks') + ' shown' : '';
  }

  q.addEventListener('input', apply);
  document.querySelectorAll('input[name="talk-group"]').forEach(function (r) {
    r.addEventListener('change', apply);
  });
})();
