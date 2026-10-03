/* Recipes: static copy of CAM/Global/Crafting/DefaultConfigs. No network calls. */
(function () {
  'use strict';
  const D = window.PS2_DATA, recipes = D.obtain.data.recipes || [];
  const index = new Map();
  for (const r of recipes) {
    if (!index.has(r.result)) index.set(r.result, []);
    index.get(r.result).push(r);
  }
  const bases = name => (index.get(name) || []).filter(r => !r.requiredTier);
  const sum = (map, key, n) => { map[key] = (map[key] || 0) + n; };
  const fresh = () => ({ costs: {}, prerequisites: {}, reusable: new Set(), steps: [], unknown: [], warnings: [] });
  function plan(name, targetTier = 1, fromTier = 0, quantity = 1, choices = {}) {
    const out = fresh();
    targetTier = Math.max(1, Math.min(3, Math.round(+targetTier || 1)));
    fromTier = Math.max(0, Math.min(targetTier, Math.round(+fromTier || 0)));
    quantity = Math.max(1, Math.min(999, Math.round(+quantity || 1)));
    function addRecipe(r, q, skipSelf = false, ancestors = []) {
      out.steps.push({ recipe: r, quantity: q });
      Object.entries(r.price || {}).forEach(([k, v]) => sum(out.costs, k, v * q));
      (r.additionalMaterials || []).forEach(x => sum(out.costs, x.name, x.amount * q));
      (r.keep || []).forEach(x => out.reusable.add(x));
      if (!r.fullPrice && Object.keys(r.price || {}).length)
        out.warnings.push('Reference price for ' + r.result + ': merchant discounts may apply.');
      for (const x of r.required || []) {
        if (skipSelf && x.name === r.result) continue;
        const options = bases(x.name);
        if (options.length === 1 && !ancestors.includes(x.name)) {
          addRecipe(options[0], q * x.amount, false, [...ancestors, x.name]);
        } else {
          sum(out.prerequisites, x.name, x.amount * q);
          sum(out.costs, x.name, x.amount * q);
          if (options.length > 1) out.warnings.push('Several recipes for ' + x.name + ': listed separately.');
        }
      }
    }
    if (fromTier === targetTier) {
      sum(out.prerequisites, name + ' T' + fromTier + ' (already owned)', quantity);
      return out;
    }
    if (fromTier > 0) sum(out.prerequisites, name + ' T' + fromTier + ' (already owned)', quantity);
    if (fromTier === 0) {
      const options = bases(name);
      const chosen = options.find(r => r.id === choices[name]) || options[0];
      if (!chosen) {
        sum(out.prerequisites, name, quantity);
        out.unknown.push('Not craftable or no recipe: ' + name);
      } else {
        addRecipe(chosen, quantity, false, [name]);
        if (options.length > 1 && !choices[name]) out.warnings.push('Route shown for ' + name + ': ' + (chosen.required || []).map(x => x.name).join(' + ') + '. Other routes exist.');
      }
    }
    for (let tier = Math.max(2, fromTier + 1); tier <= targetTier; tier++) {
      const r = (index.get(name) || []).find(x => x.tier === tier && x.requiredTier === tier - 1);
      if (r) addRecipe(r, quantity, true, [name]);
      else out.unknown.push('T' + (tier - 1) + ' → T' + tier + ' upgrade unknown: ' + name);
    }
    return out;
  }
  function buildPlan(build) {
    const out = fresh(), E = window.PS2Engine;
    const items = [{ name: build.weapon, tier: build.tier || 1 }, ...E.equipSlots(build).map(x => ({ name: x.n, tier: x.tier }))].filter(x => x.name);
    for (const item of items) {
      const p = plan(item.name, item.tier);
      for (const field of ['costs', 'prerequisites']) Object.entries(p[field]).forEach(([k, n]) => sum(out[field], k, n));
      p.reusable.forEach(x => out.reusable.add(x));
      for (const field of ['steps', 'unknown', 'warnings']) out[field].push(...p[field]);
    }
    out.unknown = [...new Set(out.unknown)]; out.warnings = [...new Set(out.warnings)];
    return out;
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const entries = o => Object.entries(o).sort(([a], [b]) => a.localeCompare(b, 'en'));
  const fmt = n => n.toLocaleString('en-US');
  function list(map) {
    return entries(map).map(([name, n]) => `<li><b>${fmt(n)}</b> ${esc(name)}</li>`).join('') || '<li>No cost listed</li>';
  }
  function html(p) {
    return `<div class="acq-grid"><div><h4>Total needed — currency, materials and items</h4><ul>${list(p.costs)}</ul></div><div><h4>Prerequisites to get separately</h4><p class="small muted">Consumed prerequisites are already in the total; don’t count them twice.</p><ul>${list(p.prerequisites)}</ul><h4>Schematics to hold (not multiplied)</h4><ul>${[...p.reusable].map(x => `<li>${esc(x)}</li>`).join('') || '<li>No schematic listed</li>'}</ul></div></div>
      <p class="small muted">Known recipe costs only, excluding prerequisite purchases and refining. For an item you already own, set its tier in the Crafting tab to count only the remaining steps.</p>
      ${[...new Set(p.warnings)].map(x => `<p class="warn small">${esc(x)}</p>`).join('')}
      ${p.unknown.length ? `<details><summary>${p.unknown.length} item(s) not covered by these recipes</summary><ul>${[...new Set(p.unknown)].map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      <details><summary>Crafting steps (${p.steps.length})</summary>${p.steps.map(({ recipe: r, quantity: q }) => `<p><b>${fmt(q)} × ${esc(r.result)}${r.tier ? ' T' + r.tier : ''}</b> · ${esc(r.station)}${r.refineKept ? ' · refine kept by the recipe' : ''}<br><span class="small">${esc(Object.entries(r.price || {}).map(([k, n]) => fmt(n * q) + ' ' + k).join(' + '))}${r.evidence ? `<br>Source: ${esc(r.evidence.module)} · ${esc(r.evidence.lines)}` : ''}</span></p>`).join('')}</details>`;
  }
  function section(build) {
    const p = buildPlan(build);
    return `<section class="acquisition"><h3>Get this build — crafting from scratch</h3>${html(p)}<button class="btn" data-craft-build>Open the crafting plan</button></section>`;
  }
  let state = { name: 'Firstlight Top', tier: 1, from: 0, qty: 1, choices: {} }, loadedBuild = null;
  function render() {
    const el = document.querySelector('#craft'); if (!el) return;
    const names = [...index.keys()].sort((a, b) => a.localeCompare(b, 'en'));
    const options = bases(state.name);
    el.innerHTML = `<h2>Crafting <span class="h-note">${recipes.length} recipes</span></h2>
      <p>Pick an item or use your current build. The site adds up known intermediate recipes, tier upgrades and materials.</p>
      <div class="row"><button class="primary" id="craft-current">Use my current build</button>${loadedBuild ? '<button class="btn" id="craft-single">Back to one item</button>' : ''}</div>
      ${loadedBuild ? `<h3>Build plan: ${esc(loadedBuild.name || 'Selected build')}</h3>${html(buildPlan(loadedBuild))}` : `
      <div class="row"><label>Item <select id="craft-item">${names.map(n => `<option value="${esc(n)}"${n === state.name ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label>Target tier <select id="craft-tier">${[1, 2, 3].map(t => `<option${t === state.tier ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Already owned <select id="craft-from">${[0, 1, 2, 3].map(t => `<option value="${t}"${t === state.from ? ' selected' : ''}>${t ? 'T' + t : 'None'}</option>`).join('')}</select></label>
      <label>Copies <input id="craft-qty" type="number" min="1" max="999" value="${state.qty}" style="width:85px"></label></div>
      ${options.length > 1 ? `<label>Starting weapon / recipe <select id="craft-route">${options.map(r => `<option value="${esc(r.id)}"${r.id === state.choices[state.name] ? ' selected' : ''}>${esc((r.required || []).map(x => x.name).join(' + '))} · ${esc(r.station)}</option>`).join('')}</select></label>` : ''}
      ${html(plan(state.name, state.tier, state.from, state.qty, state.choices))}`}
      <div class="row"><button class="btn" id="craft-copy">Copy the list</button><span id="craft-copy-status" class="small muted" role="status"></span></div>`;
    const bind = (id, fn) => { const node = el.querySelector('#' + id); if (node) node.onchange = fn; };
    bind('craft-item', e => { state.name = e.target.value; state.tier = 1; state.from = 0; render(); });
    for (const [id, key] of [['craft-tier', 'tier'], ['craft-from', 'from'], ['craft-qty', 'qty']]) bind(id, e => { state[key] = +e.target.value; state.from = Math.min(state.from, state.tier); state.qty = Math.max(1, Math.min(999, Math.round(state.qty || 1))); render(); });
    bind('craft-route', e => { state.choices[state.name] = e.target.value; render(); });
    const select = el.querySelector('#craft-item'); if (select) window.PS2Combobox.enhance(select);
    el.querySelector('#craft-current').onclick = () => { loadedBuild = JSON.parse(JSON.stringify(window.PS2App.S.calc)); render(); };
    if (loadedBuild) el.querySelector('#craft-single').onclick = () => { loadedBuild = null; render(); };
    el.querySelector('#craft-copy').onclick = async () => {
      const p = loadedBuild ? buildPlan(loadedBuild) : plan(state.name, state.tier, state.from, state.qty, state.choices);
      const text = ['Crafting', ...entries(p.costs).map(([k, n]) => `${n} ${k}`), 'Prerequisites:', ...entries(p.prerequisites).map(([k, n]) => `${n} ${k}`), 'Schematics:', ...p.reusable, ...p.unknown, ...p.warnings, 'Known costs only, excluding refining and prerequisite purchases.'].join('\n');
      try { await navigator.clipboard.writeText(text); el.querySelector('#craft-copy-status').textContent = 'List copied.'; }
      catch (_) { const box = document.createElement('textarea'); box.value = text; box.setAttribute('aria-label', 'List to copy'); el.appendChild(box); box.focus(); box.select(); el.querySelector('#craft-copy-status').textContent = 'Copy with Ctrl+C.'; }
    };
  }
  window.PS2Acquisition = { plan, buildPlan, bases, html, section, render, useBuild(b) { loadedBuild = JSON.parse(JSON.stringify(b)); render(); } };
})();
