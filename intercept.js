// Runs in the page (MAIN world) at document_start. Reads the item JSON the page itself
// loads from /character-window/get-items, so the extension makes no requests of its own.
(() => {
  const items = (window.__pctItems = new Map()); // item id -> item
  const hit = (url) => String(url).includes('/character-window/get-items');
  const take = (data) => {
    try {
      // Always work on our own copy: the page may rewrite the objects it parsed.
      data = JSON.parse(typeof data === 'string' ? data : JSON.stringify(data));
      for (const it of data?.items || []) {
        items.set(it.id, { ...it, league: it.league || data.character?.league });
      }
    } catch {}
  };

  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (hit(url)) {
      this.addEventListener('load', () => {
        try { take(this.responseType === 'json' ? this.response : this.responseText); } catch {}
      });
    }
    return open.apply(this, arguments);
  };

  const origFetch = window.fetch;
  window.fetch = function (input) {
    const p = origFetch.apply(this, arguments);
    if (hit(input?.url || input)) p.then((r) => r.clone().json()).then(take, () => {});
    return p;
  };
})();
