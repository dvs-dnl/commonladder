/* Common Ladder — Quote rotator loader (self-contained, ~1.5KB)
   Fetches /data/quotes.json once per page, then picks a random quote
   for each component that matches its data-page (+ optional data-category).
   Falls back to whatever static markup is already inside the host. */
(function () {
  var SELECTOR = '.cl-quote-rotator, .cl-voice-aside[data-rotate], .cl-quote-ribbon';
  var hosts = document.querySelectorAll(SELECTOR);
  if (!hosts.length) return;

  var promise = null;
  function load(src) {
    if (promise) return promise;
    promise = fetch(src, { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    return promise;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function pick(registry, page, category) {
    if (!registry || !registry.quotes) return null;
    var pool = registry.quotes.filter(function (q) {
      var pageMatch = Array.isArray(q.page) ? q.page.indexOf(page) !== -1 : q.page === page;
      var catMatch = !category || q.category === category;
      return pageMatch && catMatch;
    });
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function renderInline(host, q) {
    host.innerHTML =
      '<figure class="cl-quote" role="figure" aria-label="Quote from a person with lived experience of homelessness">' +
        '<div class="cl-quote__eyebrow">Lived experience</div>' +
        '<blockquote class="cl-quote__text">' + esc(q.text) + '</blockquote>' +
        '<figcaption class="cl-quote__attribution">' +
          '<span class="cl-quote__name">— ' + esc(q.attribution) + '</span>' +
          '<span class="cl-quote__source">' +
            (q.url
              ? '<a href="' + esc(q.url) + '" target="_blank" rel="noopener">' + esc(q.source || 'Source') + '</a>'
              : esc(q.source || '')) +
          '</span>' +
        '</figcaption>' +
      '</figure>';
  }

  function renderAside(host, q) {
    host.innerHTML =
      '<div class="cl-voice-aside__eyebrow">From someone who\'s been there</div>' +
      '<blockquote class="cl-voice-aside__text">' + esc(q.text) + '</blockquote>' +
      '<div class="cl-voice-aside__meta">' +
        '<span class="cl-voice-aside__name">— ' + esc(q.attribution) + '</span>' +
        (q.url
          ? ' <a class="cl-voice-aside__source" href="' + esc(q.url) + '" target="_blank" rel="noopener">' + esc(q.source || 'Source') + '</a>'
          : '') +
      '</div>';
  }

  function renderRibbon(host, q) {
    var text = q.text.length > 180 ? q.text.slice(0, 177).replace(/\s+$/, '') + '…' : q.text;
    host.innerHTML =
      '<div class="cl-quote-ribbon__inner">' +
        '<span class="cl-quote-ribbon__mark" aria-hidden="true">&ldquo;</span>' +
        '<span class="cl-quote-ribbon__text">' + esc(text) + '</span>' +
        '<span class="cl-quote-ribbon__attr">' +
          '— ' + esc(q.attribution) +
          (q.url
            ? ' &middot; <a class="cl-quote-ribbon__source" href="' + esc(q.url) + '" target="_blank" rel="noopener">' + esc(q.source || 'Source') + '</a>'
            : '') +
        '</span>' +
      '</div>';
  }

  hosts.forEach(function (host) {
    var src = host.getAttribute('data-src') || '/data/quotes.json';
    var page = host.getAttribute('data-page') || 'resource';
    var category = host.getAttribute('data-category');

    load(src).then(function (registry) {
      var q = pick(registry, page, category);
      if (!q) return;
      host.setAttribute('aria-busy', 'false');
      if (host.classList.contains('cl-quote-rotator')) renderInline(host, q);
      else if (host.classList.contains('cl-voice-aside')) renderAside(host, q);
      else if (host.classList.contains('cl-quote-ribbon')) renderRibbon(host, q);
    });
  });
})();
