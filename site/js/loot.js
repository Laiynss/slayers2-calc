/* Loot and NPC stats (configured base rates, before luck bonuses). */
(function () {
  'use strict';
  const data = window.PS2_DATA.loot || { data: [], npcs: [], unknown: [] };
  const esc = s => String(s ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—';
  let query = '', mode = 'drops';
  function render() {
    const el = document.querySelector('#loot'); if (!el) return;
    const npcMap = new Map(data.npcs.map(n => [n.code, n]));
    el.innerHTML = `<h2>Loot & NPCs</h2>
      <div class="cards cards-sm"><div class="card"><div class="k">NPCs</div><div class="v">${data.npcs.length}</div></div><div class="card"><div class="k">Drops</div><div class="v">${data.data.length}</div></div></div>
      <p>Base rates, before luck bonuses.</p>
      <div class="row"><button class="btn${mode === 'drops' ? ' active' : ''}" data-loot-mode="drops">Items and sources</button><button class="btn${mode === 'npcs' ? ' active' : ''}" data-loot-mode="npcs">NPCs and stats</button>
      <input id="loot-q" type="search" placeholder="Search an item or NPC…" value="${esc(query)}" style="max-width:100%"><span id="loot-count" role="status" class="small muted"></span></div>
      <div class="tbl-wrap"><table><thead><tr>${mode === 'drops' ? '<th>Item</th><th>NPC</th><th>Base rate</th><th>Level field</th><th>NPC respawn</th>' : '<th>NPC / code</th><th>Configured stats</th><th>Respawn</th><th>Currency rewards</th><th>Drops</th>'}</tr></thead><tbody>
      ${(mode === 'drops' ? data.data : data.npcs).map(x => {
        const search = [x.name, x.npc, x.code, ...(x.rewards || []).map(r => r.name)].join(' ');
        return `<tr data-loot-q="${esc(window.PS2Combobox.norm(search))}">${mode === 'drops' ? `<td><b>${esc(x.name)}</b></td><td>${esc(x.npc)}</td><td>${x.chance === null ? '—' : fmt(x.chance * 100) + ' %'}</td><td>${esc(x.level)}</td><td>${x.kind === 'coffre' ? 'Chest' : fmt(npcMap.get(x.npcCode)?.spawnTime) + ' s'}</td>` : `<td><b>${esc(x.name)}</b></td><td>${esc(Object.entries(x.stats).map(([k, v]) => k + ': ' + v).join('; ') || '—')}</td><td>${fmt(x.spawnTime)} s</td><td>${esc(Object.entries(x.currencies || {}).map(([k, v]) => fmt(v) + ' ' + k).join(' + '))}</td><td>${esc(x.rewards.map(r => r.name).join('; ') || 'No drop identified')}</td>`}</tr>`;
      }).join('')}</tbody></table></div>`;
    el.querySelectorAll('[data-loot-mode]').forEach(b => { b.onclick = () => { mode = b.dataset.lootMode; render(); }; });
    const filter = () => {
      const q = window.PS2Combobox.norm(query); let count = 0;
      el.querySelectorAll('[data-loot-q]').forEach(r => { const show = !q || r.dataset.lootQ.includes(q); r.classList.toggle('db-hide', !show); if (show) count++; });
      el.querySelector('#loot-count').textContent = count + ' result(s)';
    };
    el.querySelector('#loot-q').oninput = e => { query = e.target.value; filter(); }; filter();
  }
  window.PS2Loot = { render };
})();
