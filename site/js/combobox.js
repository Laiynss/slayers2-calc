/* PS2 CALC: searchable combobox. Enhances item <select>s (equipment, weapon, titles, clan, art, style, optimizer lists)
   into an input + filtered list. The native <select> stays in the DOM (visually hidden) as the source of truth:
   choosing an entry sets its value and dispatches a bubbling 'change', so the existing handlers keep working.
   Search: live, case- and accent-insensitive, partial match anywhere in the item name. Disabled options stay visible
   (greyed, with their reason) but cannot be chosen. Keys: Up/Down, Enter, Escape, Tab. */
(function () {
  'use strict';
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const SELECTOR = 'select[data-f=eqp],select[data-f=weapon],select[data-f=title],select[data-f=clan],select[data-f=art],select[data-f=style],#o-clan,#o-weapon,#o-wo-name';
  let uid = 0;

  function enhance(sel) {
    if (sel._cbx || !sel.parentNode) return;
    sel._cbx = true;
    const wrap = document.createElement('div'); wrap.className = 'cbx';
    if (sel.style.width) wrap.style.width = sel.style.width;
    sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel);
    sel.classList.add('cbx-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    const id = 'cbx' + (++uid);
    const inp = document.createElement('input');
    Object.assign(inp, { type: 'text', className: 'cbx-input', autocomplete: 'off', spellcheck: false, placeholder: 'Search…' });
    inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-expanded', 'false'); inp.setAttribute('aria-controls', id); inp.setAttribute('aria-autocomplete', 'list');
    if (sel.dataset.f) inp.dataset.cbxFor = sel.dataset.f + (sel.dataset.i !== undefined ? ':' + sel.dataset.i : '');
    else if (sel.id) inp.dataset.cbxFor = sel.id;
    const list = document.createElement('div'); list.className = 'cbx-list'; list.id = id; list.setAttribute('role', 'listbox'); list.hidden = true;
    wrap.appendChild(inp); wrap.appendChild(list);
    list.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus while scrolling the list
    const label = () => { const o = sel.options[sel.selectedIndex]; return o ? o.textContent : ''; };
    const syncLabel = () => { inp.value = label(); inp.title = inp.value; };
    syncLabel();
    let items = [], active = -1, open = false;
    const options = [...sel.options].map((o, k) => ({ o, k, search: norm(o.value) }));

    function setActive(i) {
      if (active >= 0 && items[active]) items[active].classList.remove('active');
      active = items.length ? Math.max(0, Math.min(items.length - 1, i)) : -1;
      if (active >= 0) { items[active].classList.add('active'); items[active].scrollIntoView({ block: 'nearest' }); inp.setAttribute('aria-activedescendant', items[active].id); }
    }
    function build(q) {
      const nq = norm(q.trim()); items = []; let lastG = null, n = 0;
      const fragment = document.createDocumentFragment();
      options.forEach(({ o, k, search }) => {
        if (nq && (!o.value || !search.includes(nq))) return;
        const g = o.parentNode && o.parentNode.tagName === 'OPTGROUP' ? o.parentNode.label : null;
        if (g && g !== lastG) { const h = document.createElement('div'); h.className = 'cbx-group'; h.textContent = g; fragment.appendChild(h); }
        lastG = g;
        const d = document.createElement('div'); d.id = id + '-' + k; d.className = 'cbx-opt' + (o.disabled ? ' disabled' : '') + (o.value === sel.value ? ' selected' : '');
        d.dataset.value = o.value; d.setAttribute('role', 'option');
        if (o.dataset.chip) { const c = document.createElement('span'); c.className = 'tchip t-' + (o.dataset.cat || 'x'); c.textContent = o.dataset.chip; d.appendChild(c); }
        const tx = document.createElement('span'); tx.className = 'cbx-txt'; tx.textContent = o.textContent; d.appendChild(tx); d.title = o.textContent;
        if (o.disabled) d.setAttribute('aria-disabled', 'true');
        d.onmousedown = (e) => { e.preventDefault(); if (!o.disabled) choose(o.value); };
        fragment.appendChild(d); n++; if (!o.disabled) items.push(d);
      });
      if (!n) { const e = document.createElement('div'); e.className = 'cbx-empty'; e.textContent = 'No results'; fragment.appendChild(e); }
      list.replaceChildren(fragment);
      active = -1; const si = items.findIndex((d) => d.classList.contains('selected'));
      setActive(nq ? 0 : si);
    }
    function show(q) { build(q); list.hidden = false; open = true; inp.setAttribute('aria-expanded', 'true'); wrap.classList.add('open'); }
    function hide() { list.hidden = true; open = false; inp.setAttribute('aria-expanded', 'false'); wrap.classList.remove('open'); }
    function choose(v) {
      hide(); const changed = sel.value !== v; sel.value = v; syncLabel();
      if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (sel.value !== v) syncLabel(); // a handler may have reverted it
    }
    inp.addEventListener('focus', () => { inp.select(); show(''); });
    inp.addEventListener('mousedown', () => { if (document.activeElement === inp && !open) show(''); });
    inp.addEventListener('input', (e) => { e.stopPropagation(); show(inp.value); });
    inp.addEventListener('change', (e) => e.stopPropagation());
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) show(''); else setActive(active + (e.key === 'ArrowDown' ? 1 : -1)); }
      else if (e.key === 'Enter') { e.preventDefault(); if (open && active >= 0) choose(items[active].dataset.value); }
      else if (e.key === 'Escape') { e.preventDefault(); hide(); syncLabel(); inp.select(); }
      else if (e.key === 'Tab') { hide(); syncLabel(); }
    });
    inp.addEventListener('blur', () => { hide(); syncLabel(); });
    sel.addEventListener('change', syncLabel); // programmatic / test-driven changes
  }
  function enhanceAll(root) { (root || document).querySelectorAll(SELECTOR).forEach(enhance); }
  const mo = new MutationObserver((muts) => { for (const m of muts) for (const nd of m.addedNodes) if (nd.nodeType === 1) { if (nd.matches && nd.matches(SELECTOR)) enhance(nd); else if (nd.querySelectorAll) enhanceAll(nd); } });
  function start() { enhanceAll(document); mo.observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.PS2Combobox = { enhance, enhanceAll, norm };
})();
