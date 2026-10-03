/* PS2 CALC: UI (vanilla JS). English UI. */
(function () {
  'use strict';
  const E = window.PS2Engine, O = window.PS2Optimizer, D = E.D, C = E.C;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const replaceHTML = (el, html) => {
    const opened = new Set($$('details[open]', el).map(d => d.querySelector('summary')?.textContent));
    el.innerHTML = html;
    $$('details', el).forEach(d => { if (opened.has(d.querySelector('summary')?.textContent)) d.open = true; });
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = E.fmt;
  const CONF_FR = { high: 'High', medium: 'Medium', low: 'Low', unverified: 'Unverified' };
  const FLAG_FR = {
    temporary: 'temporary buff', mode: 'needs a mode', mark: 'needs a mark', condition: 'conditional', baseUnknown: 'M1 base unknown: total unknown', baseScenario: 'Manual base: simulation only',
    curveUnknown: 'unknown curve: base values used', titlePassiveScope: 'title passive scope unverified', ciPerHitUnverified: 'CI per-hit application unverified',
    demonProgressPartial: 'partial Demon Progress', unknown: 'unknown', gcdUnknown: 'global cooldown unknown', pveScalingApprox: 'PvE "scaling" bonus modelled as a multiplier',
    ciCapUnknown: 'CI storage cap unknown', ciSkillApplicationUnknown: 'CI effect on skills unknown',
    ciAutoScenario: 'CI estimated: 12 s of continuous M1, no earlier CI', ciIncomingUnknown: 'Kamado CI not estimated: damage taken unknown',
  };
  const GROUP_FR = { base: 'Base', flat: 'Flat AD', factor: 'Factor (ADF)', clan: 'Clan %', post: 'Temporary flat', mult: 'Final multiplier', asf: 'Attack speed', elemBreathing: 'Breathing DF', elemEvil: 'Evil Art DF', elemEvilAdd: 'Evil Art DF (+)', elemArt: 'Art bonus' };
  const badge = () => ''; // confidence badges are no longer rendered (metadata kept in data/)
  const flagChips = (flags) => [...new Set(flags || [])].map((f) => `<span class="chip ${f === 'temporary' ? 'temp' : 'warn'}">${esc(FLAG_FR[f] || f)}</span>`).join('');
  const srcLinks = () => ''; // source links are no longer rendered
  // Do not hide uncertainty/provenance text from the user.
  const clean = t => typeof t === 'string' ? t.trim() : t;
  const STAT_FR = { additionalDamage: 'AD', additionalDamageFactor: 'ADF', attackSpeedFactor: 'Attack speed', breathingDamageFactor: 'Breathing DF', evilArtDamageFactor: 'Evil Art DF',
    maxHealth: 'HP', maxHealthFactor: 'Max HP', maxStamina: 'Stamina', staminaRegen: 'Stamina regen', healthRegen: 'HP regen', damageReduction: 'Dmg reduction', damageReductionFactor: 'Dmg reduction (factor)',
    movementSpeedFactor: 'Speed', movementSpeed: 'Speed', runSpeedFactor: 'Run', blockRegen: 'Block regen', blockPoints: 'Block points', illumination: 'Illumination', sunImmunity: 'Sun immunity',
    biteSpeedFactor: 'Bite speed (fishing)', fishingLuckFactor: 'Fishing luck', breathDurationFactor: 'Breath duration', questExpFactor: 'Quest EXP', itemClass: 'Class' };
  const fmtStats = (o) => Object.entries(o || {}).map(([k, v]) => (v === true ? STAT_FR[k] || k : `${STAT_FR[k] || k} ${typeof v === 'number' && v < 3 && /Factor|Regen|regen|Speed/.test(k) ? String(v) + '×' : (typeof v === 'number' && v > 0 ? '+' : '') + String(v)}`)).join(', ');
  const TCAT_FR = { combat: 'Combat', exploration: 'Exploration', fishing: 'Fishing', ouwigahara: 'Ouwigahara', progression: 'Progression', mastery: 'Mastery', race: 'Race', other: 'Other' };
  /* item type chips (presentation only) */
  const chipShort = (it) => { const c = E.catOf(it); return c === 'accessory' ? (D.rules.slotLabels[it.slot] || it.slot) : E.catLabel(c); };
  const tchip = (it) => (it ? `<span class="tchip t-${E.catOf(it)}" title="${esc(E.itemLabel(it))}">${esc(chipShort(it))}</span>` : '');
  const withChip = (html, chip, cat) => html.replace('<option ', `<option data-chip="${esc(chip)}" data-cat="${esc(cat)}" `);


  /* ---------------- state ---------------- */
  const LS = 'ps2calc_v1';
  let S = {};
  try { S = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { S = {}; }
  const allAD = () => D.skilltree.data.filter((n) => n.additionalDamage).map((n) => n.name);
  function freshCalc() { const b = E.defaultBuild('slayer'); b.skillNodes = allAD(); b.unlockedTitles = []; return b; }
  // Builds are never saved: each visit starts from an empty build.
  S.calc = freshCalc();
  S.cmp = [Object.assign(freshCalc(), { name: 'Build A' }), Object.assign(freshCalc(), { name: 'Build B' })];
  [S.calc, ...S.cmp].forEach(b => { if (!b.inputs.ciMode) b.inputs.ciMode = +b.inputs.ciStored || +b.inputs.ciDealtNpc || +b.inputs.ciDealtPlayer ? 'manual' : 'auto'; });
  S.owned = [...new Set((S.owned || []).map((n) => E.resolveName('weapons', E.resolveName('equipment', n))))]; S.moves = S.moves || {}; S.weaponOverrides = S.weaponOverrides || {}; S.formula = S.formula && C.formulas[S.formula] ? S.formula : null;
  S.opt = S.opt || { tier: 1, refine: 0, faction: 'slayer', mode: 'm1', topN: 10, includeTemp: false, ownedOnly: false, excludeLow: false, clanMode: 'best', fixedClan: '', weaponMode: 'best', fixedWeapon: '', titlePool: 'all' };
  S.opt.allowDuplicates = false;
  if (S.opt.tier === undefined) { S.opt.tier = 1; S.opt.refine = 0; }
  S.targetHp = +S.targetHp > 0 ? +S.targetHp : 3000;   // bosses all have 3,000 HP
  const save = () => { try { const { calc, cmp, ...kept } = S; localStorage.setItem(LS, JSON.stringify(kept)); } catch (e) { /* file:// quota etc. */ } };
  E.setMoveOverrides(S.moves);
  // One reference calculation in the product. Old browser selections must
  // not silently keep a removed experimental formula active.
  S.formula = null;
  const activeFormula = () => C.formula;
  function ciPreviewText(b, ce) {
    if (b.inputs.ciMode === 'auto') {
      if (b.clan === 'Kamado') return 'Kamado stores the damage you take: the game decides that number, the site cannot guess it. Enter it above to see the bonus.';
      const r = E.evaluate(b, { formula: activeFormula(), contributions: false }), ci = r.ciEstimate;
      return ci ? `Estimate: ${fmt(ci.baselineDps)} damage/s without CI × ${ci.windowSec} s × ${fmt(ci.share * 100)} % → storage ${fmt(ci.storage)} → +${fmt(ci.additionalDamage)} AD for 7 s.` : 'No bonus yet: tick “Combat Intuition active” to see it.';
    }
    const ci = E.combatIntuition(b, ce.e);
    return `Computed storage: ${fmt(ci.storage)} → +${fmt(ci.additionalDamage)} AD ${ce.active ? '(active)' : '(not applied in the chosen state)'}. Storage cap unknown.`;
  }
  function ciScenarioHTML(res) {
    const ci = res.ciEstimate;
    return ci ? `<div class="small warn" data-ci-scenario><b>Combat Intuition — estimated scenario</b>: ${fmt(ci.baselineDps)} M1 damage/s without CI × ${ci.windowSec} s × ${fmt(ci.share * 100)} % × 0.1 = +${fmt(ci.additionalDamage)} AD for 7 s. Target without damage reduction that stays alive; continuous attacks and build conditions kept. No skills and no earlier CI.</div>` : '';
  }

  /* ---------------- header ---------------- */
  $('#hdr-patch').textContent = `${C.version.patch} (${C.version.patchDate})`;
  $('#hdr-compiled').textContent = C.version.dataCompiled;
  $$('#tabs button').forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  /* equipment = 5 free pickers stored as a list of names (nulls keep picker positions).
     Five shared Stats slots; one copy of each equipment (user correction). */
  function picksOf(b) {
    const pk = (Array.isArray(b.equipment) ? b.equipment : E.equipList(b)).map((n) => (n && E.IDX.equipment[n] ? n : null)).slice(0, D.rules.maxEquipSlots);
    while (pk.length < D.rules.maxEquipSlots) pk.push(null);
    return pk;
  }
  function setPicks(b, pk) { const t = b.equipTier || []; b.equipment = pk.slice(); b.equipTier = pk.map((n, i) => (n ? +t[i] || 1 : 1)); delete b.equipmentDuplicatesRemoved; }
  /* why item `n` cannot go into picker i (null = allowed) */
  function pickBlock(b, pk, i, n) {
    const it = E.IDX.equipment[n]; if (!it) return null;
    if (pk.some((x, j) => j !== i && x === n)) return 'this item is already worn in another slot';
    const c = E.catOf(it); const others = pk.filter((x, j) => j !== i && x && E.catOf(E.IDX.equipment[x]) === c);
    if (others.length >= E.catMax(c)) return `${E.catLabel(c).toLowerCase()} already taken: ${others.join(', ')}`;
    return null;
  }
  function showTab(t) {
    if (t === 'opt') t = 'best';
    if (t === 'patch') t = 'help';
    if (!$('#tab-' + t)) t = 'calc';
    $$('#tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === t));
    $$('.tab').forEach(x => x.classList.toggle('active', x.id === 'tab-' + t));
    $('#more-sections').open = false;
    $('#more-sections').classList.toggle('active', ['db', 'craft', 'loot', 'help'].includes(t));
    location.hash = t;
    if (t === 'db') renderDB(); if (t === 'craft') window.PS2Acquisition.render(); if (t === 'loot') window.PS2Loot.render();
    if (t === 'help') renderHelp(); if (t === 'cmp') renderCompare();
    if (t === 'best') { renderBestForm(); if (!lastBest) runBest(); }
  }

  /* ---------------- build editor ---------------- */
  const opt = (v, label, sel, dis) => `<option value="${esc(v)}"${sel ? ' selected' : ''}${dis ? ' disabled' : ''}>${esc(label)}</option>`;
  function editorHTML(b, id) {
    const w = E.IDX.weapons[b.weapon];
    const weapons = D.weapons.data.filter((x) => E.factionAllowed(x.faction, b.faction, b.rules));
    const clans = D.clans.data;
    const arts = b.faction === 'slayer' ? D.breathings.data : D.bdas.data;
    const eqCount = E.equipList(b).length;
    const picks = picksOf(b);
    const typeLbl = (t) => D.rules.slotLabels[t] || t;
    const itemOpt = (it, cur, i) => {
      const ok = E.factionAllowed(it.faction, b.faction, b.rules); const why = cur === it.name ? null : pickBlock(b, picks, i, it.name);
      const st = [it.additionalDamage ? '+' + it.additionalDamage + ' AD' : '', it.additionalDamageFactor && it.additionalDamageFactor !== 1 ? it.additionalDamageFactor + 'x' : ''].filter(Boolean).join(', ');
      return withChip(opt(it.name, `${it.name}${st ? ' (' + st + ')' : ''}${ok ? '' : ' [faction]'}${why ? ' : ' + why : ''}`, cur === it.name, !ok || !!why), chipShort(it), E.catOf(it));
    };
    const slotRows = picks.map((cur, i) => {
      const items = E.equippable();
      const groups = [
        ...[...new Set(items.map((it) => E.catOf(it)).filter((c) => c !== 'accessory'))].map((c) => ({ label: E.catLabel(c) + (Number.isFinite(E.catMax(c)) ? ' (max ' + E.catMax(c) + ')' : ''), items: items.filter((it) => E.catOf(it) === c) })),
        ...E.slotTypes().map((ty) => ({ label: E.catLabel('accessory') + ' : ' + typeLbl(ty), items: items.filter((it) => E.catOf(it) === 'accessory' && it.slot === ty) })),
      ].filter((g) => g.items.length).map((g) => `<optgroup label="${esc(g.label)}">${g.items.map((it) => itemOpt(it, cur, i)).join('')}</optgroup>`).join('');
      const curIt = cur && E.IDX.equipment[cur];
      return `<div class="slot-row${curIt ? ' filled' : ''}${curIt && curIt.series ? ' has-tier' : ''}"><span class="slot-lbl"><b>Item ${i + 1}</b>${curIt ? tchip(curIt) : '<span class="tchip t-empty">free</span>'}</span><select data-f="eqp" data-i="${i}">${opt('', '— empty —', !cur)}${groups}</select>${curIt && curIt.series ? `<select data-f="eqtier" data-i="${i}" class="eq-tier">${[1, 2, 3].map((t) => opt(t, 'T' + t + ' (×' + String(E.seriesTierMult(t)) + ')', +((b.equipTier || [])[i] || 1) === t)).join('')}</select>` : ''}</div>`;
    }).join('');
    const titleOpts = (sel) => opt('', '— none —', !sel) + D.titles.data.map((t) => opt(t.name, t.name + (Object.keys(t.buffWhileEquipped || {}).length ? ' : ' + fmtStats(t.buffWhileEquipped) : ''), sel === t.name)).join('');
    const passTitles = D.titles.data.filter((t) => t.passiveAlwaysOn && t.passiveAlwaysOn.additionalDamage);
    const effs = E.activeEffects(b);
    const hearing = effs.find((x) => x.e.skillName === 'Enhanced Hearing');
    const conds = [...new Set(effs.flatMap((x) => x.e.conds))];
    const COND_FR = { hpAbove90: 'My HP > 90 %', hpBelow60: 'My HP < 60 %', hpBelow30: 'My HP < 30 %', targetBelow30: 'Target < 30 % HP', airborne: 'Airborne', fists: 'Bare-handed (fists)', inZone: 'In the zone', party: 'Party buff active', afterBlock: 'After a block' };
    const clanObj = E.IDX.clans[b.clan];
    const hasCI = effs.some((x) => x.e.stats.ciConversion), hasRA = effs.some((x) => x.e.stats.m1FlatPer100Skill);
    const ciEffect = effs.find((x) => x.e.stats.ciConversion);
    // only the controls this clan really has (a clan without a mode or a mark no longer shows those switches)
    const hasTempEff = effs.some((x) => x.e.requires.includes('temp')), hasModeEff = effs.some((x) => x.e.requires.includes('mode')), hasMarkEff = effs.some((x) => x.e.requires.includes('mark'));
    const skillRes = (b.toggles.temp || b.toggles.mode || b.toggles.mark) ? E.evaluate(b, { formula: activeFormula(), contributions: false }) : null;
    const skillDelta = skillRes && skillRes.m1 !== null && skillRes.m1Perm !== null && skillRes.m1 > skillRes.m1Perm + 1e-9
      ? `<p class="small skills-delta">Permanent M1 <b>${fmt(skillRes.m1Perm)}</b> → with the active skills <b>${fmt(skillRes.m1)}</b> (+${fmt((skillRes.m1 / skillRes.m1Perm - 1) * 100)} %)</p>` : '';
    const ciSimpleVal = b.inputs.ciMode === 'manual' && (b.inputs.ciInputStage || 'raw') === 'raw' && +b.inputs.ciStored > 0 ? b.inputs.ciStored : '';
    const ciStage = b.inputs.ciInputStage || 'raw', ciPhase = b.inputs.ciPhase || 'release';
    const ciAuto = b.inputs.ciMode === 'auto';
    const ciSource = b.inputs.ciSourceTarget || b.target;
    const modeEffect = effs.find((x) => x.e.requires.includes('mode'));
    const timedEffects = effs.filter((x) => x.e.durationSec && x.e.requires.every(r => b.toggles[r]));
    const stackEffs = effs.filter((x) => x.e.stats.stackInput);
    const rFac = D.rules.configurableRules.applyUnverifiedFactionRestrictions;
    const ws = w ? E.weaponStats(b) : null;
    return `
    <fieldset><legend>Character</legend>
      <div class="row"><label>Weapon mastery</label><input type="number" min="0" max="${C.baseM1.maxMastery}" data-f="mastery" value="${b.mastery}"></div>
      <div class="row"><label>Level</label><input type="number" min="1" max="${C.maxLevel}" data-f="level" value="${b.level}">
        <label style="min-width:auto">Faction</label><select data-f="faction">${opt('slayer', 'Slayer', b.faction === 'slayer')}${opt('demon', 'Demon', b.faction === 'demon')}<option disabled>Hybrid (WIP)</option></select></div>
      <details class="secondary-tools"><summary>Optional base scenario</summary><div class="row"><label>M1 base</label><input type="number" min="0" step="0.01" data-f="baseOverride" value="${b.baseOverride ?? ''}" placeholder="unknown"> <span class="small muted">A manual base is only a simulation and does not affect the automatic ranking.</span></div></details>
      <div class="row"><label>Clan</label><select data-f="clan">${opt('', '— none —', !b.clan)}${clans.map((c) => opt(c.name, `${c.name} (${c.rarity.split(' ')[0]})${c.additionalDamageFactorPct ? ' : ADF ' + c.additionalDamageFactorPct + ' %' : ''}`, b.clan === c.name)).join('')}</select>${clanObj ? badge(clanObj.confidence) + srcLinks(E.entrySources(clanObj)) : ''}</div>
    </fieldset>
    <fieldset><legend>Weapon</legend>
      <div class="row"><select data-f="weapon" style="width:100%">${opt('', '— none —', !b.weapon)}${weapons.map((x) => withChip(opt(x.name, `${x.name} : +${x.additionalDamage ?? 0} AD${x.additionalDamageFactor ? ', ' + x.additionalDamageFactor + 'x' : ''}`, b.weapon === x.name), x.type || 'weapon', 'weapon')).join('')}</select></div>
      <div class="row"><label>Tier / Refine</label><select data-f="tier" aria-label="Tier">${[1, 2, 3].map((t) => opt(t, 'T' + t, +b.tier === t, !!w && t > (w.maxTier || 1))).join('')}</select><select data-f="refine" aria-label="Refine">${[...Array(11).keys()].map((r) => opt(r, 'R' + r + (r === 10 ? ' (max)' : ''), +b.refine === r, !!w && r > (w.maxRefine ?? 10))).join('')}</select>${w && !w.maxTier ? ' <span class="small muted">(no tier for this weapon)</span>' : ''}</div>
      <details class="secondary-tools"><summary>Correct the weapon stats manually</summary><div class="row"><label>Tooltip</label>AD <input type="number" step="0.01" data-f="wad" value="${b.weaponOverride.ad ?? ''}" placeholder="${ws ? +ws.ad.toFixed(3) : ''}"> ADF <input type="number" step="0.0001" data-f="wadf" value="${b.weaponOverride.adf ?? ''}" placeholder="${ws ? +ws.adf.toFixed(4) : ''}"></div></details>
      ${ws ? `<div class="wstats" id="${id}-wstats"><span><b>+${fmt(ws.ad, 3)}</b> AD</span><span><b>${fmt(ws.adf, 4)}x</b> ADF</span>${w && w.m1Timing ? `<span><b>${fmt(w.m1Timing.chainSpanSec, 2)} s</b> 5-hit chain</span>` : ''}<span class="muted">T${ws.tier} R${ws.refine}</span></div><div class="small muted">${esc(clean(ws.notes.join(' ')))}</div>` : ''}
      ${w && w.artLane !== undefined ? (() => { const ok = E.weaponArts(w, b.faction), all = (b.faction === 'slayer' ? D.breathings.data : D.bdas.data).length; const kind = b.faction === 'slayer' ? 'breathing' : 'BDA'; return `<div class="small ${!ok.length || (b.art && !ok.includes(b.art)) ? 'warn' : 'muted'}" data-weapon-arts>${!ok.length ? `No ${kind} with this weapon: its skills cannot be used.` : `Usable ${kind}: ${ok.length === all ? 'all' : ok.map(esc).join(', ')}.`}${b.art && ok.length && !ok.includes(b.art) ? ` ${esc(b.art)} does not work with it.` : ''}</div>`; })() : ''}
    </fieldset>
    <fieldset class="fs-equip"><legend>Equipment <span class="count${eqCount === D.rules.maxEquipSlots ? ' full' : ''}">${eqCount}/${D.rules.maxEquipSlots}</span></legend>
      <div class="small muted">${D.rules.maxEquipSlots} free slots shared by accessories, outfits, haori, tops and bottoms (no limit per type). One copy of each item, even at different tiers. Series items (Nightfall / Firstlight): tier per slot.</div>
      ${b.equipmentDuplicatesRemoved && b.equipmentDuplicatesRemoved.length ? `<p class="small warn">Old build fixed: duplicate copies removed (${b.equipmentDuplicatesRemoved.map(esc).join(', ')}). The first slot of each item was kept; the others are free.</p>` : ''}
      ${slotRows}
      <div class="row small"><label style="min-width:auto"><input type="checkbox" data-f="rule" data-rule="applyUnverifiedFactionRestrictions" ${E.ruleValue('applyUnverifiedFactionRestrictions', b.rules) ? 'checked' : ''}> Apply faction restrictions (e.g. Demonic Horns = demon)</label>${badge(rFac.confidence)}</div>
    </fieldset>
    <fieldset><legend>Titles (max ${D.rules.maxTitles})</legend>
      ${b.titles.map((t, i) => `<div class="row"><select data-f="title" data-i="${i}" style="width:100%">${titleOpts(t)}</select></div>`).join('')}
      <details class="secondary-tools"><summary>Unlocked titles — collection bonus</summary>
      <div class="row small">${passTitles.map((t) => `<label style="min-width:auto"><input type="checkbox" data-f="unlocked" value="${esc(t.name)}" ${b.unlockedTitles.includes(t.name) ? 'checked' : ''}> ${esc(t.name)} (+${t.passiveAlwaysOn.additionalDamage})</label>`).join(' ')}</div></details>
    </fieldset>
    <fieldset><legend>Progression & Skill tree</legend>
      <div class="row small">${D.skilltree.data.filter((n) => n.additionalDamage).map((n) => `<label style="min-width:auto"><input type="checkbox" data-f="node" value="${esc(n.name)}" ${b.skillNodes.includes(n.name) ? 'checked' : ''}> ${esc(n.name.replace('Additional Damage node ', 'AD node '))} (+${fmt(n.additionalDamage, 1)})</label>`).join(' ')} <button class="btn" type="button" data-f="nodesAll">All</button> <button class="btn" type="button" data-f="nodesNone">None</button></div>
      ${b.faction === 'demon' ? `<div class="row"><label>Demon Progress</label><select data-f="demonProgress">${[0, 1, 2, 3, 4].map((l) => opt(l, l === 4 ? 'Lv. 4 (Max): +2 AD, +0.04 Evil Art DF' : l === 0 ? 'Lv. 0' : 'Lv. ' + l + ': no damage', +b.demonProgress === l)).join('')}</select></div>` : `<div class="small muted">Slayer Progress: no damage (HP, stamina, Breathing Boost)</div>`}
    </fieldset>
    <details class="secondary-tools"><summary>Art and fighting style</summary><fieldset><legend>Art & style</legend>
      <div class="row"><label>${b.faction === 'slayer' ? 'Breathing' : 'Blood Demon Art'}</label><select data-f="art">${opt('', '— none —', !b.art)}${arts.map((a) => opt(a.name, a.name, b.art === a.name)).join('')}</select></div>
      <div class="row"><label>Fighting style</label><select data-f="style">${opt('', '— none —', !b.style)}${D.fightingstyles.data.filter((s) => !s.name.startsWith('All')).map((s) => opt(s.name, s.name, b.style === s.name)).join('')}</select></div>
    </fieldset></details>
    <fieldset><legend>Buffs & conditions</legend>
      ${clanObj && (hasTempEff || hasModeEff || hasMarkEff) ? `<div class="row small clan-skills">
        ${hasTempEff ? `<label style="min-width:auto"><input type="checkbox" data-f="tog" data-t="temp" ${b.toggles.temp ? 'checked' : ''}> ${hasCI ? 'Combat Intuition active' : b.clan === 'Uzui' ? 'Vital Draw active' : hasRA ? 'Repetitive Action active' : 'Temporary buffs ON'}</label>` : ''}
        ${hasModeEff ? `<label style="min-width:auto"><input type="checkbox" data-f="tog" data-t="mode" ${b.toggles.mode ? 'checked' : ''}> ${modeEffect ? esc(modeEffect.e.skillName || modeEffect.e.name) + ' active' : 'Mode ON'}</label>` : ''}
        ${hasMarkEff ? `<label style="min-width:auto"><input type="checkbox" data-f="tog" data-t="mark" ${b.toggles.mark ? 'checked' : ''}> ${hearing ? 'Enhanced Hearing active on the target' : 'Mark effect on the target'}</label>` : ''}
      </div>${skillDelta}` : `<p class="small muted">${clanObj ? esc(b.clan) + ' has no skill that changes the M1 damage.' : 'Pick a clan: its skills (Combat Intuition, Enhanced Hearing, modes) appear here.'}</p>`}
      ${hearing ? `<p class="small muted">Enhanced Hearing marks the target: it takes +${fmt(hearing.e.stats.markPct)} % from you for ${hearing.e.durationSec} s, then ${hearing.e.cooldownSec} s of cooldown. Tick it to see the M1 while the mark is on; untick it for the permanent value.</p>` : ''}
      ${b.clan === 'Agatsuma' ? '<p class="small muted">Agatsuma: Unconscious Combat applies automatically from your HP (+4 AD and +12 % ADF below 60 %; −5 % attack speed above 90 %). Sleepless Knight Mode adds +3 % ADF; its +20 % Thunder applies to Thunder skills, not M1s.</p>' : ''}
      <div class="row"><label>Target</label><select data-f="target">${opt('npc', 'NPC / boss (PvE)', b.target === 'npc')}${opt('player', 'Player (PvP)', b.target === 'player')}</select></div>
      ${conds.length ? `<div class="row small">${conds.map((c) => `<label style="min-width:auto"><input type="checkbox" data-f="cond" data-c="${c}" ${b.conds[c] ? 'checked' : ''}> ${esc(COND_FR[c] || c)}</label>`).join(' ')}</div>` : ''}
      ${hasCI ? `<div class="row"><label>${b.clan === 'Soyama' ? 'Damage dealt (last 12 s)' : 'Damage taken (last 10 s)'}</label><input type="number" min="0" data-f="ciSimple" value="${ciSimpleVal}" placeholder="${b.clan === 'Soyama' ? 'empty = estimated from the build' : 'enter what you took'}"></div>
        <p class="small" data-ci-preview>${esc(ciPreviewText(b, ciEffect))}</p>
        <details class="secondary-tools"><summary>Combat Intuition — advanced (mode, phase, weighted storage)</summary>
        <div class="row"><label>Combat Intuition calculation</label><select data-f="ciMode">${opt('auto', 'Automatic — no damage input', ciAuto)}${opt('manual', 'Advanced — use a known value', !ciAuto)}</select></div>

        <div class="row"><label>Combat Intuition — phase</label><select data-f="ciPhase">${opt('storage', 'Storing — no AD bonus yet', ciPhase === 'storage')}${opt('release', 'Bonus released — 7 s window', ciPhase === 'release')}${opt('inactive', 'Inactive / finished', ciPhase === 'inactive')}</select></div>
        <p class="small muted">${b.clan === 'Soyama' ? '12 s storage: 50 % of damage dealt to NPCs, 75 % to players; +8 % damage reduction while storing.' : '10 s storage: damage taken.'} Automatic release or second activation after at least 0.3 s. Bonus: storage ×0.1 added to AD before ADF for 7 s. Base cooldown 60 s.</p>
        ${ciAuto ? `<p class="small muted">${b.clan === 'Soyama' ? 'Uses the build’s sustained M1 DPS over 12 s, without skills, interruptions or an earlier CI bonus. The selected target type sets 50 % NPC / 75 % players.' : 'Damage taken is not guessed: the unknown Kamado bonus is left out of the automatic result.'}</p>` : `<details class="secondary-tools" open><summary>Known value — advanced options</summary><div class="row"><label>Entered value</label><select data-f="ciInputStage">${opt('raw', 'Damage before storage', ciStage === 'raw')}${opt('stored', 'Storage already weighted', ciStage === 'stored')}</select></div>
        ${b.clan === 'Soyama' && ciStage === 'raw' ? `<div class="row"><label>Source of stored damage</label><select data-f="ciSourceTarget" aria-label="Combat Intuition damage source">${opt('npc', 'Dealt to NPCs (50 %)', ciSource === 'npc')}${opt('player', 'Dealt to players (75 %)', ciSource === 'player')}${opt('mixed', 'NPCs and players — enter separately', ciSource === 'mixed')}</select></div>` : ''}
        ${b.clan === 'Soyama' && ciStage === 'raw' && ciSource === 'mixed' ? `<div class="row"><label>Damage dealt to NPCs</label><input type="number" min="0" data-f="ciDealtNpc" value="${b.inputs.ciDealtNpc || 0}"><label>To players</label><input type="number" min="0" data-f="ciDealtPlayer" value="${b.inputs.ciDealtPlayer || 0}"></div>` : `<div class="row"><label>${ciStage === 'stored' ? 'Storage already weighted' : b.clan === 'Soyama' ? 'Damage dealt' : 'Damage taken'}</label><input type="number" min="0" data-f="ci" value="${b.inputs.ciStored || 0}"></div>`}
        </details>`}
        </details>` : ''}
      ${b.clan === 'Uzui' ? `<div class="row"><label>Vital Draw result</label><select data-f="vitalDraw">${['Muscle', 'Heart', 'Lungs'].map(x => opt(x, x, (b.inputs.vitalDraw || 'Muscle') === x)).join('')}</select></div><p class="small muted">Only the Muscle draw gives +15 % ADF to fists for 6 s. The draw is random: the bonus is not guaranteed on every activation.</p>` : ''}
      ${timedEffects.length ? `<details class="secondary-tools"><summary>Skill activity windows</summary><p class="small muted">Simulated state, not a timer linked to the game. When the duration runs out, the bonus is removed from the calculation. For CI the time starts at release; for the others, at activation.</p>${timedEffects.map(x => `<div class="row"><label>${esc(x.e.skillName || x.e.name)} — seconds elapsed</label><input type="number" min="0" step="0.1" data-f="effectTime" data-effect="${esc(x.e.id)}" value="${(b.inputs.effectElapsed || {})[x.e.id] || 0}"><span class="small muted">Duration ${x.e.durationSec} s · base cooldown ${x.e.cooldownSec ?? '—'} s${x.expired ? ' · expired' : ''}</span></div>`).join('')}</details>` : ''}
      ${hasRA ? `<div class="row"><label>Recent skill damage</label><input type="number" data-f="ra" value="${b.inputs.recentSkillDamage || 0}"> <span class="small muted">Repetitive Action (+3 / 100)</span></div>` : ''}
      ${stackEffs.map((x) => `<div class="row"><label>${esc(x.e.owner)}: stacks</label><input type="number" min="0" data-f="stack" data-s="${x.e.stats.stackInput}" value="${(b.inputs.stacks || {})[x.e.stats.stackInput] || 0}"> <span class="small muted">${esc(x.e.name)}</span></div>`).join('')}
      <details class="secondary-tools"><summary>Buff uptime for skill rotations</summary><div class="row"><label>Uptime</label><input type="number" min="0" max="100" data-f="uptime" value="${Math.round((b.uptime ?? 1) * 100)}"> %</div></details>
      <div class="small muted">Clan / set effects: ${effs.length ? effs.map((x) => `<span class="chip ${x.active ? 'temp' : ''}">${x.active ? '✔ ' : ''}${esc(clean(x.e.name))}</span>`).join('') : 'none'}</div>
      ${clanObj && clanObj.runtimeDetails ? `<details class="secondary-tools"><summary>${esc(b.clan)} skills and passives — effects and conditions</summary>${clanObj.runtimeDetails.map(x => `<p class="small"><b>${esc(x.name)}</b> — ${esc(x.text)}</p>`).join('')}</details>` : ''}
    </fieldset>`;
  }
  function bindEditor(el, b, onChange) {
    let pending;
    el.oninput = el.onchange = (ev) => {
      const t = ev.target, f = t.dataset.f; if (!f) return;
      // Native selects/checkboxes emit both input and change. Apply them once.
      if (ev.type === 'input' && (t.tagName === 'SELECT' || t.type === 'checkbox')) return;
      const v = t.value; const numOrNull = (x) => (x === '' ? null : +x);
      let rerender = ev.type === 'change';
      switch (f) {
        case 'level': b.level = Math.max(1, Math.min(C.maxLevel, +v || 1)); break;
        case 'mastery': b.mastery = Math.max(0, Math.min(C.baseM1.maxMastery, Math.floor(+v) || 0)); break;
        case 'faction': b.faction = v; b.art = null; if (b.weapon && !E.factionAllowed((E.IDX.weapons[b.weapon] || {}).faction, v, b.rules)) b.weapon = null; setPicks(b, picksOf(b).map((n) => { const it = n && E.IDX.equipment[n]; return it && E.factionAllowed(it.faction, v, b.rules) ? n : null; })); if (v !== 'demon') b.demonProgress = 0; break;
        case 'baseOverride': b.baseOverride = numOrNull(v); break;
        case 'clan': b.clan = v || null; break;
        case 'weapon': { b.weapon = v || null; b.weaponOverride = { ad: null, adf: null }; const nw = E.IDX.weapons[b.weapon]; if (nw && +b.tier > (nw.maxTier || 1)) b.tier = nw.maxTier || 1; break; }
        case 'tier': b.tier = +v; break; case 'refine': b.refine = +v; break;
        case 'wad': b.weaponOverride.ad = numOrNull(v); break; case 'wadf': b.weaponOverride.adf = numOrNull(v); break;
        case 'eqp': { const i = +t.dataset.i; const pk = picksOf(b); if (v) { const why = pickBlock(b, pk, i, v); if (why) { alert(`Cannot equip ${v}: ${why}. Rule: 5 slots in total.`); t.value = pk[i] || ''; return; } } const chg = pk[i] !== (v || null); pk[i] = v || null; setPicks(b, pk); if (chg) b.equipTier[i] = 1; break; }
        case 'eqtier': { const i = +t.dataset.i; b.equipTier = (b.equipTier || []).slice(); while (b.equipTier.length <= i) b.equipTier.push(1); b.equipTier[i] = +v || 1; break; }
        case 'rule': { b.rules = Object.assign({}, b.rules, { [t.dataset.rule]: t.checked }); setPicks(b, picksOf(b).map((n) => { const it = n && E.IDX.equipment[n]; return it && E.factionAllowed(it.faction, b.faction, b.rules) ? n : null; })); break; }
        case 'title': { const i = +t.dataset.i; if (v && b.titles.includes(v) && b.titles[i] !== v) { alert('This title is already equipped.'); t.value = b.titles[i] || ''; return; } b.titles[i] = v || null; break; }
        case 'unlocked': b.unlockedTitles = $$('input[data-f=unlocked]', el).filter((x) => x.checked).map((x) => x.value); break;
        case 'node': b.skillNodes = $$('input[data-f=node]', el).filter((x) => x.checked).map((x) => x.value); break;
        case 'demonProgress': b.demonProgress = +v; break;
        case 'art': b.art = v || null; break; case 'style': b.style = v || null; break;
        case 'tog': b.toggles[t.dataset.t] = t.checked; break; case 'cond': b.conds[t.dataset.c] = t.checked; break;
        case 'ciSourceTarget': b.inputs.ciSourceTarget = v; break;
        case 'ciInputStage': b.inputs.ciInputStage = v; break;
        case 'ciMode': b.inputs.ciMode = v; break;
        case 'ciPhase': b.inputs.ciPhase = v; break;
        case 'ciDealtNpc': case 'ciDealtPlayer': b.inputs[f] = Math.max(0, +v || 0); rerender = false; break;
        case 'vitalDraw': b.inputs.vitalDraw = v; break;
        case 'effectTime': b.inputs.effectElapsed = Object.assign({}, b.inputs.effectElapsed, { [t.dataset.effect]: Math.max(0, +v || 0) }); break;
        case 'target': b.target = v; break;
        case 'ciSimple': { const n = Math.max(0, +v || 0); b.inputs.ciStored = n; b.inputs.ciInputStage = 'raw'; b.inputs.ciMode = n > 0 ? 'manual' : 'auto'; break; }
        case 'ci': b.inputs.ciStored = +v || 0; rerender = false; break; case 'ra': b.inputs.recentSkillDamage = +v || 0; break;
        case 'stack': b.inputs.stacks = Object.assign({}, b.inputs.stacks, { [t.dataset.s]: +v || 0 }); break;
        case 'uptime': b.uptime = Math.max(0, Math.min(100, +v || 0)) / 100; break;
      }
      const preview = $('[data-ci-preview]', el);
      if (preview) {
        const ce = E.activeEffects(b).find(x => x.e.stats.ciConversion);
        if (ce) preview.textContent = ciPreviewText(b, ce);
      }
      if (pending) cancelAnimationFrame(pending);
      if (ev.type === 'input') pending = requestAnimationFrame(() => { pending = null; onChange(false); });
      else { pending = null; onChange(rerender); }
    };
    el.onclick = (ev) => {
      const f = ev.target.dataset && ev.target.dataset.f;
      if (f === 'nodesAll' || f === 'nodesNone') { b.skillNodes = f === 'nodesAll' ? allAD() : []; onChange(true); }
    };
  }

  /* ---------------- results ---------------- */
  function breakdownHTML(res, metric) {
    const rows = res.comps.filter((c) => (metric === 'hps' ? (c.group === 'asf' || c.group === 'cycle') : metric === 'skill' ? /^elem|mult|post/.test(c.group) : c.group !== 'asf' && c.group !== 'cycle' && !/^elem/.test(c.group)));
    const f = C.formulas[res.formula];
    let head = '';
    if (metric === 'hps') head = `<div class="formula">Hits/s = ${C.m1ChainHits} / (${fmt(res.agg.cycle, 3)} s / ${fmt(res.agg.asf, 4)}) = ${fmt(res.hitsPerSec, 4)}</div><div class="small muted">One cycle = 4 × delay between hits + delay after the 5th hit, divided by attack speed (1 + Σ Attack Speed Factor).</div>`;
    else if (metric === 'skill') head = `<div class="formula">Skill damage = entered damage × art multiplier (${fmt(res.skill.mult.mult, 4)})${res.build.target === 'npc' ? ' × any V0.182 PvE bonus' : ''} ${C.temporaryFlatMode === 'postFlat' && res.agg.post ? '+ flat bonus × hits' : ''}</div><div class="small muted">${res.skill.mult.parts.map((p) => esc(p[0]) + ' ×' + fmt(p[1], 4)).join(' · ') || 'No active art multiplier.'} · AD/ADF not applied to skills.</div>`;
    else head = `<div class="formula">M1 = ${esc(E.explainFormula(res))} = ${fmt(res.m1, 4)}\n5th hit = ${esc(E.explainFormula(res, true))} = ${fmt(res.m1Fin, 4)}${metric === 'dps' ? `\nM1 DPS = average/hit ((${C.m1ChainHits - 1} × ${fmt(res.m1, 4)} + ${fmt(res.m1Fin, 4)}) / ${C.m1ChainHits} = ${fmt(res.m1Avg, 4)}) × ${fmt(res.hitsPerSec, 4)} hits/s = ${fmt(res.dps, 4)}` : ''}${metric === 'chain' ? `\nChain = ${C.m1ChainHits - 1} × ${fmt(res.m1, 4)} + ${fmt(res.m1Fin, 4)} = ${fmt(res.chain, 4)} in ${fmt(res.chainTime, 3)} s` : ''}</div>
      <div class="small">ΣAD = ${fmt(res.agg.A, 4)} · Π(ADF items/titles/weapon) = ${fmt(res.agg.Fprod, 4)} · Σ(ADF−1) = ${fmt(res.agg.Fsum, 4)} · Clan % = ${fmt(res.agg.clan * 100, 2)} % · Permanent: M1 ${fmt(res.m1Perm)} / With temporary: ${fmt(res.m1)}</div>`;
    const body = rows.map((c) => `<tr><td>${esc(clean(c.label) || c.label)}${clean(c.note) ? ` <span class="muted" title="${esc(clean(c.note))}">ⓘ</span>` : ''}</td><td>${GROUP_FR[c.group] || c.group}</td><td class="num">${c.value === null ? '—' : fmt(c.value, 4)}</td>
      <td class="num">${metric === 'hps' || metric === 'skill' ? '' : c.deltaM1 === null ? '—' : (c.deltaM1 >= 0 ? '+' : '') + fmt(c.deltaM1, 3)}</td><td class="num">${metric === 'dps' || metric === 'hps' ? (c.deltaDps === null ? '—' : (c.deltaDps >= 0 ? '+' : '') + fmt(c.deltaDps, 3)) : ''}</td>
      <td>${c.temporary ? '<span class="chip temp">temporary</span>' : '<span class="chip">permanent</span>'}${flagChips(c.flags.filter((x) => x !== 'temporary'))}</td></tr>`).join('');
    return `<div class="breakdown">${head}<table><thead><tr><th>Component</th><th>Group</th><th class="num">Value</th><th class="num">M1 contribution</th><th class="num">${metric === 'dps' || metric === 'hps' ? 'DPS contribution' : ''}</th><th>Type</th></tr></thead><tbody>${body || '<tr><td colspan=6 class="muted">No component.</td></tr>'}</tbody></table>
      <div class="small muted">Contribution = final value − value without this component (contributions do not add up exactly when factors multiply).</div></div>`;
  }
  const openBD = {};
  function damageExpression(terms, decimals = 2) {
    if (!terms) return null;
    if (terms.numeric !== null) return fmt(terms.numeric, decimals);
    const base = Math.abs(terms.coefficient - 1) < 1e-10 ? 'B' : `${fmt(terms.coefficient, 3)} × B`;
    const expression = `${base} ${terms.offset < 0 ? '−' : '+'} ${fmt(Math.abs(terms.offset), decimals)}`;
    return terms.rounding === 'round' ? `round(${expression})` : terms.rounding === 'floor' ? `floor(${expression})` : expression;
  }
  function dpsExpression(res) {
    if (res.dpsPerm !== null) return fmt(res.dpsPerm);
    const m = res.m1PermTerms, f = res.finPermTerms, n = C.m1ChainHits, h = res.hitsPerSecPerm;
    if (!m || !f || m.rounding !== 'none' || f.rounding !== 'none') return null;
    return damageExpression({ numeric: null, rounding: 'none', coefficient: ((n - 1) * m.coefficient + f.coefficient) / n * h,
      offset: ((n - 1) * m.offset + f.offset) / n * h });
  }
  function card(key, label, value, unit, conf, extra, res, metric, nodata) {
    return `<div class="card"><div class="k">${label} ${badge(conf)}</div>${nodata ? `<div class="nodata">${nodata}</div>` : `<div class="v">${value}<small> ${unit || ''}</small></div>`}<div class="pt">${extra || ''}</div>
      ${metric ? `<button class="toggle-calc" data-bd="${key}">${openBD[key] ? 'Hide' : 'Show'} calculation</button>` : ''}</div>`;
  }
  function hero(key, label, value, unit, extra, metric, nodata, kanji, main) {
    return `<div class="card hero${main ? ' main' : ''}" data-k="${kanji || ''}"><div class="k">${label}</div>${nodata ? `<div class="nodata">${nodata}</div>` : `<div class="v">${value}<small> ${unit || ''}</small></div>`}<div class="pt">${extra || ''}</div>
      ${metric ? `<button class="toggle-calc" data-bd="${key}">${openBD[key] ? 'Hide' : 'Show'} calculation</button>` : ''}</div>`;
  }
  /* AD / ADF split by source (display only: sums the components already computed by the engine) */
  const SRC = [['w', 'Weapon'], ['eq', 'Equipment'], ['t', 'Titles'], ['st', 'Skill tree'], ['dp', 'Progression'], ['fx', 'Clan / effects'], ['clan', 'Clan'], ['o', 'Other']];
  const srcOfComp = (c) => { const id = c.id || ''; if (id === 'clan') return 'clan'; const p = id.split('_')[0]; return SRC.some((x) => x[0] === p) ? p : 'o'; };
  function splitHTML(res) {
    if (!res.agg) return '';
    const stats = E.resolvedStats(res.agg);
    const a = { ...res.agg, A: stats.additionalDamage, Fsum: stats.additionalDamageFactor - 1 - res.agg.clan };
    const ad = {}, fa = {};
    res.comps.forEach((c) => { if (c.value === null || c.value === undefined) return; const k = srcOfComp(c);
      if (c.group === 'flat') ad[k] = (ad[k] || 0) + c.value;
      else if (c.group === 'factor') fa[k] = (fa[k] || 0) + (c.value - 1);
      else if (c.group === 'clan') fa.clan = (fa.clan || 0) + c.value; });
    const bar = (m, total) => { const segs = SRC.filter(([k]) => m[k] > 1e-9); if (!segs.length) return '<div class="bar empty"></div>';
      return `<div class="bar">${segs.map(([k, l]) => `<span class="seg s-${k}" style="width:${((m[k] / total) * 100).toFixed(2)}%" title="${esc(l)} : ${fmt(m[k], 3)}"></span>`).join('')}</div>
        <div class="legend">${segs.map(([k, l]) => `<span><i class="dot s-${k}"></i>${esc(l)} <b>${fmt(m[k], 3)}</b></span>`).join('')}</div>`; };
    const tA = Object.values(ad).reduce((x, y) => x + y, 0), tF = Object.values(fa).reduce((x, y) => x + (y > 0 ? y : 0), 0);
    return `<div class="split">
      ${res.formula === 'F4' && !a.post && (a.mult === 1 || a.mult === undefined) ? `<div class="split-eq"><span class="op">(</span><span class="term"><small>Base${a.baseKnown ? '' : ' unknown'}</small>${a.baseKnown ? fmt(a.base, 3) : 'B'}</span><span class="op">+</span><span class="term"><small>ΣAD</small>${fmt(a.A, 3)}</span><span class="op">) ×</span><span class="term"><small>Total ADF</small>${fmt(1 + a.Fsum + a.clan, 4)}</span><span class="op">=</span><span class="term res"><small>M1</small>${damageExpression(res.m1Terms, 3) || 'UNKNOWN'}</span></div>` : `<div class="split-eq"><span class="term res"><small>M1</small>${damageExpression(res.m1Terms, 3) || 'UNKNOWN'}</span><span class="op">=</span><span class="term wide"><small>formula</small>${esc(E.explainFormula(res))}</span></div>`}
      <div class="split-row"><div class="split-h">Flat AD <b>${fmt(tA, 3)}</b></div>${bar(ad, tA || 1)}</div>
      <div class="split-row"><div class="split-h">Factors Σ(ADF−1) + clan <b>${fmt(tF, 4)}</b> <span class="muted">· Π ADF ${fmt(a.Fprod, 4)}</span></div>${bar(fa, tF || 1)}</div>
    </div>`;
  }
  /* Nightfall bleed: shown beside the M1 DPS, with the target's HP (3,000 by default, "Change HP") */
  function bleedHTML(b, dps) {
    const bl = E.bleedOf(b, S.targetHp); if (!bl) return '';
    return `<div class="panel bleed-box" data-bleed><div class="row" style="align-items:baseline;gap:18px;flex-wrap:wrap">
      <div><div class="small muted">BLEED</div><b style="font-size:1.6em">+${fmt(bl.dps, 2)}</b> <span class="small">damage/s</span></div>
      ${dps !== null && dps !== undefined ? `<div><div class="small muted">M1 DPS + BLEED</div><b style="font-size:1.6em">${fmt(dps + bl.dps, 2)}</b> <span class="small">damage/s</span></div>` : ''}
      ${dps !== null && dps !== undefined && E.nightfallHuntOn(b) ? `<div><div class="small muted">OVER A WHOLE KILL</div><b style="font-size:1.6em">${fmt(E.fightDps(b, dps, S.targetHp), 2)}</b> <span class="small">damage/s</span><div class="small muted">with Nightfall Hunt: +${fmt(E.huntPct() * 100, 0)} % on the last 30 % of HP</div></div>` : ''}
      <div class="small muted" style="flex:1;min-width:260px">${bl.stacks} stacks × ${fmt(bl.pct * 100, 2)} % of <b>${bl.hp.toLocaleString('en-US')} HP</b> every ${fmt(bl.tickSec, 2)} s (${fmt(bl.perTick, 2)} per stack). To verify: on Shinora the game showed about 6 per stack.</div>
      <button class="btn" type="button" data-hp-toggle>Change HP</button>
      <span data-hp-row hidden><input type="number" min="1" step="1" data-hp value="${bl.hp}" style="width:110px"> HP</span></div></div>`;
  }
  function bindHp(el, rerender) {
    const bt = $('[data-hp-toggle]', el), row = $('[data-hp-row]', el), inp = $('[data-hp]', el);
    if (!bt) return;
    bt.onclick = () => { row.hidden = !row.hidden; if (!row.hidden) inp.focus(); };
    inp.onchange = () => { const v = Math.round(+inp.value); if (v > 0) { S.targetHp = v; save(); rerender(); } };
  }
  function resultsHTML(res, prefix) {
    const conditionalRes = res;
    res = E.evaluatePermanent(res.build, { formula: res.formula });
    const v = res.validation; const t = res.build.toggles;
    const dep = [t.temp && 'temporary buffs', t.mode && 'mode', t.mark && 'mark'].filter(Boolean);
    const nd = 'No data';
    const m1Val = damageExpression(res.m1PermTerms);
    let h = `<h2>Permanent M1 damage of this build</h2>`;
    const rs = E.resolvedStats(res.agg);
    h += res.m1 === null ? `<div class="warn small" data-base-unresolved>B is the M1 base, unknown for this mastery. The added number is the permanent AD × ADF contribution, not the total damage.</div>` : res.flags.includes('baseScenario') ? `<div class="warn small">Simulation with a manually entered base.</div>` : '';
    if (v.errs.length) h += v.errs.map((e) => `<div class="err">⛔ ${esc(e)}</div>`).join('');
    if (v.warns.length) h += v.warns.map((e) => `<div class="warn">⚠ ${esc(e)}</div>`).join('');
    if (dep.length) h += `<div class="warn small">Values including: ${dep.join(', ')} (see “permanent” for the value without buffs).</div>`;
    h += `<div class="small">${flagChips(res.flags)}</div>`;
    h += `<div class="hero-grid">`;
    h += hero(prefix + 'm1', 'Permanent M1', m1Val, '/ hit', res.m1 === null ? 'Expression with unknown B' : 'No mode, mark or conditional effect', 'm1', m1Val === null ? 'Damage unknown' : null, '刃', true);
    const finVal = damageExpression(res.finPermTerms), dpsVal = dpsExpression(res);
    h += hero(prefix + 'fin', 'Permanent 5th hit', finVal, '/ hit', 'For information; does not decide the ranking', null, finVal === null ? 'Damage unknown' : null, '型');
    h += hero(prefix + 'dps', 'Permanent M1 DPS', dpsVal, 'damage/s', `${fmt(res.hitsPerSec, 3)} hits/s · does not decide the ranking`, 'dps', dpsVal === null ? 'Damage unknown' : null, '力');
    h += `</div>`;
    h += bleedHTML(res.build, res.dps);
    h += `<details class="secondary-tools"><summary>Calculation details and other stats</summary>` + splitHTML(res);
    if (res.hitStages) h += hitStagesHTML(res);
    h += `<div class="small">Build stats: AD ${fmt(rs.additionalDamage, 3)} · ADF ${fmt(rs.additionalDamageFactor, 3)}× · Attack speed ${fmt(rs.attackSpeedFactor, 3)}×.</div>`;
    h += `<div class="cards cards-sm">`;
    h += card(prefix + 'hps', 'Hits / s', fmt(res.hitsPerSec, 3), 'hits/s', res.conf.hps, `Permanent: ${fmt(res.hitsPerSecPerm, 3)}`, res, 'hps');
    h += card(prefix + 'chain', '5-hit chain', res.chain === null ? null : fmt(res.chain), `in ${fmt(res.chainTime, 3)} s`, res.conf.m1, '', res, 'chain', res.chain === null ? 'M1 base needed' : null);
    h += card(prefix + 'skill', 'Skills (1× each)', res.skill.once === null ? null : fmt(res.skill.once), '', 'unverified', res.skill.anyMove ? 'Values you entered' : 'Enter your measurements below', res, 'skill', res.skill.once === null ? nd : null);
    h += card(prefix + 'burst', `Burst (${C.burstWindowSec} s)`, res.burst === null ? null : fmt(res.burst), '', 'unverified', res.burstSim ? `Rotation: ${res.burstSim.log.map((x) => x[1] + '@' + x[0] + 's').join(' → ') || 'M1 only'} + ${res.burstSim.m1Hits} M1` : 'Damage, cast time and cooldown needed', res, null, res.burst === null ? nd : null);
    h += card(prefix + 'sust', `Sustained boss DPS (${C.sustainWindowSec} s)`, res.sustained === null ? null : fmt(res.sustained), 'damage/s', 'unverified', res.sustSim ? `${res.sustSim.casts.map((c) => c.key + '×' + c.count).join(', ')} + ${res.sustSim.m1Hits} M1 · temp. uptime ${Math.round((res.build.uptime ?? 1) * 100)} %` : 'Damage, cast time and cooldown needed', res, null, res.sustained === null ? nd : null);
    h += '</div>';
    h += buildStatsHTML(res.build);
    h += '</details>';
    if (conditionalRes.comps.some(c => c.temporary)) h += `<details class="secondary-tools" data-conditional-view><summary>Conditional effects simulation — outside the permanent ranking</summary><p class="small">The calculator’s temporary settings are kept, but they affect neither the permanent M1 above nor the best-build search.</p>${ciScenarioHTML(conditionalRes)}${conditionalRes.hitStages ? hitStagesHTML(conditionalRes) : ''}</details>`;
    h += `<details class="secondary-tools"><summary>How to get the items and materials</summary>${window.PS2Acquisition.section(res.build)}</details>`;
    ['m1', 'hps', 'dps', 'chain', 'skill'].forEach((m) => { if (openBD[prefix + m]) h += `<h3>Calculation: ${{ m1: 'M1 damage', hps: 'Hits/s', dps: 'M1 DPS', chain: '5-hit chain', skill: 'Skills' }[m]}</h3>` + breakdownHTML(res, m); });
    return h;
  }
  function bindResults(el, rerender) { $$('button[data-bd]', el).forEach((b) => (b.onclick = () => { openBD[b.dataset.bd] = !openBD[b.dataset.bd]; rerender(); })); }
  function hitStagesHTML(res) {
    const s = res.hitStages;
    return `<div class="hit-stages"><p class="small">M1 = (base + AD) × ADF; 5th hit = (2 × base + AD) × ADF; base = 3 + 0.027 × weapon mastery. Effects on combat damage are applied separately, not added to ADF.</p><div class="formula">M1 before combat effects: ${fmt(s.normalBeforeCombatEffects, 4)}\n5th before combat effects: ${fmt(s.finisherBeforeCombatEffects, 4)}\nCombat effects: ×${fmt(s.combatMultiplier, 4)}\nM1 shown: ${fmt(s.normalFinal, 4)} · 5th shown: ${fmt(s.finisherFinal, 4)}</div>${s.temporaryFlat ? `<p class="small muted">Separate temporary flat bonus: ${fmt(s.temporaryFlat, 4)}.</p>` : ''}</div>`;
  }
  function buildStatsHTML(build) {
    const st = BB.statTotals(build);
    const tiles = [
      ['Bonus HP', '+' + fmt(st.maxHealth, 1), `Max HP bonus: ${fmt(st.maxHealthFactor * 100, 2)} %`],
      ['Bonus stamina', '+' + fmt(st.maxStamina, 1), `Regen: +${fmt(st.staminaRegen * 100, 2)} %`],
      ['Movement', '+' + fmt(st.movementSpeedFactor * 100, 2) + ' %', 'Movement bonus, not M1 speed'],
      ['Damage reduction', fmt(st.damageReductionFactor * 100, 2) + ' %', `Flat reduction: +${fmt(st.damageReduction, 2)}`],
      ['Block', '+' + fmt(st.blockPoints, 2) + ' pts', `Regen: +${fmt(st.blockRegen * 100, 2)} %`],
      ['HP regen', '+' + fmt(st.healthRegen * 100, 2) + ' %', 'Permanent bonus'],
    ];
    return `<section class="build-secondary"><h3>Bonuses of the selected build</h3><p class="small muted">Weapon, equipment, clan, titles and progression; tiers applied, weapon refine on the stats it affects. These are bonuses, not the character’s total HP. Temporary effects are not included.</p><div class="cards cards-sm">${tiles.map(([k, v, n]) => `<div class="card"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="small muted">${esc(n)}</div></div>`).join('')}</div></section>`;
  }

  /* ---------------- skills editor ---------------- */
  function skillsHTML(b, res) {
    if (!b.art) return `<h2>Skills</h2><div class="muted">Pick a Breathing / Blood Demon Art to enter skill values.</div>`;
    const moves = E.movesFor(b.art);
    const artObj = E.IDX.breathings[b.art] || E.IDX.bdas[b.art];
    let h = `<h2>Skills: ${esc(b.art)}</h2>
      ${res.comps.some(x => x.id.startsWith('fx_ci_') && x.value > 0) ? '<p class="small warn">Combat Intuition is included as AD in M1s. The skill and rotation values below do not include it.</p>' : ''}
      <div class="small muted">No public data for per-skill damage. Enter your measurements on a dummy (sum of the numbers shown for one use). Values are kept in this browser.</div>
      <table><thead><tr><th>Key</th><th>Name</th><th class="num">Damage (1 use)</th><th class="num">Hits</th><th class="num">Cast (s)</th><th class="num">Cooldown (s)</th><th>Measured on</th><th class="num">Final (build)</th><th>V0.182 notes / block (not counted)</th></tr></thead><tbody>`;
    moves.forEach((m, i) => {
      const r = res.skill.rows[i] || {};
      h += `<tr><td>${esc(m.key)}</td><td>${esc(m.name || '—')}</td>
        <td class="num"><input type="number" step="0.1" data-mv="damage" data-k="${esc(m.key)}" value="${m.damage ?? ''}" placeholder="—"></td>
        <td class="num"><input type="number" data-mv="hits" data-k="${esc(m.key)}" value="${m.hits ?? ''}" placeholder="—" style="width:60px"></td>
        <td class="num"><input type="number" step="0.05" data-mv="castTime" data-k="${esc(m.key)}" value="${m.castTime ?? ''}" placeholder="—" style="width:70px"></td>
        <td class="num"><input type="number" step="0.5" data-mv="cooldown" data-k="${esc(m.key)}" value="${m.cooldown ?? ''}" placeholder="—" style="width:70px"></td>
        <td><select data-mv="damageMeasuredVs" data-k="${esc(m.key)}">${opt('', '—', !m.damageMeasuredVs)}${opt('npc', 'NPC/dummy (≥ V0.182)', m.damageMeasuredVs === 'npc')}${opt('player', 'Player', m.damageMeasuredVs === 'player')}</select></td>
        <td class="num">${r.final === null || r.final === undefined ? '<span class="muted">—</span>' : fmt(r.final)}${r.pve && r.pve !== 1 ? ` <span class="chip warn" title="V0.182 PvE bonus ${r.pveKind === 'scaling' ? '(scaling, upper bound)' : ''}">PvE ×${r.pve}</span>` : ''}</td>
        <td class="small">${(m.notes || []).map(clean).filter(Boolean).map(esc).join('<br>')}${(m.blockDamageChanges || []).length ? '<br><span class="muted">Block: ' + m.blockDamageChanges.map(esc).join(' ; ') + '</span>' : ''}</td></tr>`;
    });
    h += `</tbody></table><div class="row"><button class="btn" id="mv-add">+ Add a row</button><button class="btn" id="mv-clear">Clear my values for this art</button><button class="btn" id="mv-export">Export (JSON)</button></div>
      <div class="small muted">Recent changes: ${(artObj ? artObj.recentChanges : []).map(esc).join(' · ') || '—'}</div>
      <div class="small muted">Rotation: best damage per cast time among ready skills, otherwise M1. Global cooldown: 0 s.</div>`;
    return h;
  }
  function bindSkills(el, b, onChange) {
    const cur = () => (S.moves[b.art] = S.moves[b.art] || E.movesFor(b.art).map((m) => ({ key: m.key, name: m.name, damage: m.damage, hits: m.hits, castTime: m.castTime, cooldown: m.cooldown, damageMeasuredVs: m.damageMeasuredVs })));
    $$('[data-mv]', el).forEach((inp) => (inp.onchange = () => {
      const list = cur(); let m = list.find((x) => x.key === inp.dataset.k); if (!m) { m = { key: inp.dataset.k }; list.push(m); }
      m[inp.dataset.mv] = inp.dataset.mv === 'damageMeasuredVs' ? inp.value || null : inp.value === '' ? null : +inp.value;
      E.setMoveOverrides(S.moves); save(); invalidateSearchResults(); onChange();
    }));
    const add = $('#mv-add', el); if (add) add.onclick = () => { const list = cur(); list.push({ key: 'M' + (list.length + 1), name: 'User entry', damage: null }); E.setMoveOverrides(S.moves); save(); invalidateSearchResults(); onChange(); };
    const clr = $('#mv-clear', el); if (clr) clr.onclick = () => { delete S.moves[b.art]; E.setMoveOverrides(S.moves); save(); onChange(); };
    const ex = $('#mv-export', el); if (ex) ex.onclick = () => { const txt = JSON.stringify({ [b.art]: E.movesFor(b.art) }, null, 1); navigator.clipboard && navigator.clipboard.writeText(txt).catch(() => {}); alert('Copied (or copy below):\n\n' + txt.slice(0, 1500)); };
  }

  /* ---------------- calculator page ---------------- */
  function renderCalc() {
    const b = S.calc; const res = E.evaluate(b, { formula: activeFormula() });
    const ed = $('#calc-editor'); replaceHTML(ed, `<h2>My build</h2>` + editorHTML(b, 'calc') + `<div class="row"><button class="btn" id="calc-reset">Reset</button><button class="btn" id="calc-toA">→ Compare (A)</button><button class="btn" id="calc-toB">→ Compare (B)</button></div>`);
    bindEditor(ed, b, (full) => { save(); invalidateSearchResults(); full ? renderCalc() : renderCalcResults(); });
    $('#calc-reset').onclick = () => { S.calc = freshCalc(); save(); renderCalc(); };
    $('#calc-toA').onclick = () => { S.cmp[0] = Object.assign(JSON.parse(JSON.stringify(b)), { name: 'Build A' }); save(); showTab('cmp'); };
    $('#calc-toB').onclick = () => { S.cmp[1] = Object.assign(JSON.parse(JSON.stringify(b)), { name: 'Build B' }); save(); showTab('cmp'); };
    renderCalcResults(res);
  }
  function renderCalcResults(res) {
    const b = S.calc; res = res || E.evaluate(b, { formula: activeFormula() });
    const el = $('#calc-results'); replaceHTML(el, resultsHTML(res, 'calc_')); bindResults(el, () => renderCalcResults()); bindHp(el, () => renderCalcResults());
    $('[data-craft-build]', el).onclick = () => { window.PS2Acquisition.useBuild(b); showTab('craft'); };
    const sk = $('#calc-skills'); sk.innerHTML = skillsHTML(b, res); bindSkills(sk, b, () => renderCalcResults());
  }

  /* ---------------- optimizer page ---------------- */
  let optFormKey;
  function renderOptForm() {
    const o = S.opt; const b = S.calc;
    const key = JSON.stringify([o, b, S.owned, S.weaponOverrides, S.moves]);
    if (key === optFormKey && $('#opt-form').firstChild) return;
    optFormKey = key;
    const modes = ['m1', 'dps', 'overall', 'burst', 'boss', 'skill'];
    const ready = O.movesReady(b.art);
    const el = $('#opt-form');
    el.innerHTML = `<h2>Build optimizer</h2>
      <div class="small muted">Search after dominance pruning. Constraints: faction, 1 weapon, 1 clan, 1 art, ${D.rules.maxEquipSlots} distinct items, exclusions, titles ≤ ${D.rules.maxTitles}. Mastery, skill tree nodes, art, target and buffs come from the <b>Calculator</b> (mastery ${b.mastery}, ${b.skillNodes.length} AD nodes, art: ${esc(b.art || 'none')}).</div>
      <div class="grid2" style="margin-top:8px">
        <div class="row"><label>Faction</label><select id="o-fac">${opt('slayer', 'Slayer', o.faction === 'slayer')}${opt('demon', 'Demon', o.faction === 'demon')}<option disabled>Hybrid (WIP)</option></select></div>
        <div class="row"><label>Goal</label><select id="o-mode">${modes.map((m) => { const i = O.modeInfo(m); const dis = i.needsMoves && !ready; return opt(m, i.label + (i.needsMoves ? (ready ? ' [your values]' : ': needs data') : ''), o.mode === m, dis); }).join('')}</select></div>
        <div class="row"><label>Demon Progress</label><select id="o-dp">${opt('calc', 'Same as calculator', o.demonProgress === 'calc')}${opt('4', 'Lv. 4 (Max): +2 AD', o.demonProgress !== 'calc')}</select><span class="small muted">(Demon only)</span></div>
        <div class="row"><label>Weapons evaluated at</label><select id="o-tier" aria-label="Weapon tier">${[1, 2, 3].map((t) => opt(t, 'T' + t, +o.tier === t)).join('')}</select><select id="o-refine" aria-label="Weapon refine">${[...Array(11).keys()].map((r) => opt(r, 'R' + r, +o.refine === r)).join('')}</select> <button class="btn" type="button" id="o-tr-calc">= calculator (T${b.tier} R${b.refine})</button></div>
        <div class="row"><label>Top N</label><input type="number" id="o-top" min="1" max="50" value="${o.topN}"></div>
        <div class="row"><label>Clan</label><select id="o-clanmode">${opt('best', 'Best clan', o.clanMode === 'best')}${opt('fixed', 'Fixed clan:', o.clanMode === 'fixed')}</select><select id="o-clan">${opt('', '— none —', !o.fixedClan)}${D.clans.data.map((c) => opt(c.name, c.name, o.fixedClan === c.name)).join('')}</select></div>
        <div class="row"><label>Weapon</label><select id="o-wmode">${opt('best', 'Best weapon', o.weaponMode === 'best')}${opt('fixed', 'Fixed weapon:', o.weaponMode === 'fixed')}</select><select id="o-weapon">${D.weapons.data.map((w) => opt(w.name, w.name, o.fixedWeapon === w.name)).join('')}</select></div>
        <div class="row"><label>Titles</label><select id="o-tpool">${opt('all', 'All titles', o.titlePool === 'all')}${opt('unlocked', 'Only my unlocked titles (calculator)', o.titlePool === 'unlocked')}</select></div>
      </div>
      <div class="row small">
        <label style="min-width:auto"><input type="checkbox" id="o-temp" ${o.includeTemp ? 'checked' : ''}> Include the calculator’s temporary buffs / modes / marks / conditions</label>
        <label style="min-width:auto"><input type="checkbox" id="o-owned" ${o.ownedOnly ? 'checked' : ''}> Only my available items</label>
      </div>
      ${ownedPickerHTML('opt')}
      <div class="small muted">Each weapon is evaluated at the chosen tier and refine (tier capped at the weapon’s maximum; M1 cadence per weapon type). Tooltip values entered below take priority.</div>
      <div class="row small">${Object.keys(S.weaponOverrides).length ? Object.entries(S.weaponOverrides).map(([n, v]) => `<span class="chip">${esc(n)} : ${v.ad ?? '—'} AD / ${v.adf ?? '—'}x <a href="#" data-delwo="${esc(n)}">✕</a></span>`).join('') : '<span class="muted">No custom weapon.</span>'}
        <select id="o-wo-name">${D.weapons.data.map((w) => opt(w.name, w.name)).join('')}</select> AD <input type="number" step="0.01" id="o-wo-ad"> ADF <input type="number" step="0.001" id="o-wo-adf"> <button class="btn" id="o-wo-add">Add</button></div>
      <div class="row"><button class="primary" id="o-run">Run optimization</button><button class="btn" id="o-cancel">Cancel</button><span id="o-status" class="muted small"></span></div>`;
    const sync = () => { Object.assign(o, { tier: +$('#o-tier').value, refine: +$('#o-refine').value, faction: $('#o-fac').value, mode: $('#o-mode').value, topN: Math.max(1, Math.min(50, +$('#o-top').value || 10)), clanMode: $('#o-clanmode').value, fixedClan: $('#o-clan').value, weaponMode: $('#o-wmode').value, fixedWeapon: $('#o-weapon').value, titlePool: $('#o-tpool').value, demonProgress: $('#o-dp').value, includeTemp: $('#o-temp').checked, allowDuplicates: false, ownedOnly: $('#o-owned').checked, excludeLow: false }); save(); };
    $$('select,input', el).forEach((x) => { if (!x.id.startsWith('o-wo')) x.onchange = sync; });
    bindOwnedPicker(el);
    $('#o-wo-add').onclick = () => { const n = $('#o-wo-name').value; const ad = $('#o-wo-ad').value, adf = $('#o-wo-adf').value; if (ad === '' && adf === '') return; S.weaponOverrides[n] = { ad: ad === '' ? null : +ad, adf: adf === '' ? null : +adf }; save(); renderOptForm(); };
    $$('[data-delwo]', el).forEach((a) => (a.onclick = (ev) => { ev.preventDefault(); delete S.weaponOverrides[a.dataset.delwo]; save(); renderOptForm(); }));
    $('#o-run').onclick = () => { sync(); runOpt(); };
    $('#o-cancel').onclick = () => { ++optRequest; window.PS2Search.cancel('opt'); $('#o-status').textContent = 'Cancelled.'; };
    $('#o-tr-calc').onclick = () => { $('#o-tier').value = String(b.tier); $('#o-refine').value = String(b.refine); sync(); };
    if (window.PS2Search.active.includes('opt')) $('#o-status').textContent = 'Calculating in the background…';
  }
  let lastOpt = null, optRequest = 0; const openOpt = {};
  async function runOpt() {
    const o = { ...S.opt }, request = ++optRequest; $('#o-status').textContent = 'Calculating in the background… (you can keep using the site)';
      const tpl = JSON.parse(JSON.stringify(S.calc)); tpl.faction = o.faction;
      if (tpl.art && !(o.faction === 'slayer' ? E.IDX.breathings[tpl.art] : E.IDX.bdas[tpl.art])) tpl.art = null;
      if (o.faction !== 'demon') tpl.demonProgress = 0; else if (o.demonProgress !== 'calc') tpl.demonProgress = 4;
      const result = await window.PS2Search.run('opt', { tier: o.tier, refine: o.refine, faction: o.faction, mode: o.mode, topN: o.topN, template: tpl, includeTemp: o.includeTemp, allowDuplicates: false, ownedOnly: o.ownedOnly, owned: new Set(S.owned), excludeLow: o.excludeLow, clanMode: o.clanMode, fixedClan: o.fixedClan || null, weaponMode: o.weaponMode, fixedWeapon: o.fixedWeapon, titlePool: o.titlePool, weaponOverrides: S.weaponOverrides, formula: activeFormula() }, S.moves);
      if (request !== optRequest || result.cancelled) return;
      lastOpt = result;
      $('#o-status').textContent = lastOpt.error ? '' : lastOpt.cacheHit ? 'Same result taken from cache.' : `${lastOpt.stats.evals.toLocaleString('en-US')} combinations evaluated in ${lastOpt.stats.ms} ms`;
      renderOptResults();
  }
  function renderOptResults() {
    const el = $('#opt-results'); const r = lastOpt; if (!r) { el.innerHTML = ''; return; }
    if (r.error) { el.innerHTML = `<div class="panel err">⛔ ${esc(r.error)}</div>`; return; }
    const unit = { m1: 'damage/hit', dps: 'damage/s', overall: 'damage/s', boss: 'damage/s', burst: 'damage', skill: 'damage' }[r.mode];
    let h = `<div class="panel"><h2>Results: ${esc(r.info.label)} <span class="small muted">formula ${r.fid}</span></h2>
      <div class="small muted">Formula ${r.fid}. Weapons evaluated at T${r.tier} R${r.refine} (tier capped at each weapon’s maximum).${r.info.needsMoves ? ' This mode uses your skill values.' : ''}</div>
      ${r.warnings.map((w) => `<div class="warn small">⚠ ${esc(w)}</div>`).join('')}
      <details class="small muted"><summary>Search details (pruning)</summary>Equipment combinations: ${r.stats.accCombosRaw} (${r.stats.accCombos} distinct, ${r.stats.accCombosKept} non-dominated) · title combinations: ${r.stats.titleCombos} · distinct equipment+titles: ${r.stats.gear} · weapons (non-dominated groups): ${r.stats.weapons} · clan groups: ${r.stats.clanGroups} · max optimizer/calculator gap: ${r.stats.maxEngineMismatch.toExponential(1)}<br>${Object.entries(r.stats.pruneInfo).map(([s, p]) => `${esc(E.catLabel(s))}: ${p.candidates} items → ${p.kept} kept (${p.keptNames.map(esc).join(', ')})`).join('<br>')}</details>
      <div class="tbl-wrap"><table><thead><tr><th>#</th><th class="num">Score (${unit})</th><th>Weapon</th><th>Clan</th><th>Equipment</th><th>Titles</th><th class="num">M1</th><th class="num">Hits/s</th><th class="num">M1 DPS</th><th></th></tr></thead><tbody>`;
    r.results.forEach((x, i) => {
      const b = x.build, res = x.res;
      const eq = E.equipList(b).map((n) => { const al = (x.alts.items || {})[n] || []; return `<div class="eq-line">${tchip(E.IDX.equipment[n])} ${esc(n)}${al.length ? ` <span class="alts">or ${al.map(esc).join(', ')}</span>` : ''}</div>`; }).join('');
      h += `<tr class="opt-row"><td>${x.rank}</td><td class="num"><b>${fmt(x.score)}</b></td><td>${esc(b.weapon)} <span class="muted small">T${b.tier} R${b.refine}</span>${b.weaponOverride.ad !== null || b.weaponOverride.adf !== null ? ' <span class="chip">tooltip</span>' : ''}${x.alts.weapon.length ? `<div class="alts">or: ${x.alts.weapon.map(esc).join(', ')}</div>` : ''}</td>
        <td>${esc(b.clan || '—')}${x.alts.clan.length ? `<div class="alts">or: ${x.alts.clan.map((c) => esc(c || 'none')).join(', ')}</div>` : ''}</td><td>${eq || '—'}</td><td>${b.titles.filter(Boolean).map(esc).join('<br>') || '—'}</td>
        <td class="num">${fmt(res.m1)}</td><td class="num">${fmt(res.hitsPerSec, 3)}</td><td class="num">${fmt(res.dps)}</td>
        <td><button class="btn" data-od="${i}">${openOpt[i] ? 'Hide' : 'Calculation'}</button> <button class="btn" data-ol="${i}">→ Calculator</button> <button class="btn" data-oa="${i}">→ A</button> <button class="btn" data-ob="${i}">→ B</button></td></tr>`;
      if (openOpt[i]) h += `<tr><td colspan="10">${breakdownHTML(res, r.mode === 'm1' ? 'm1' : 'dps')}</td></tr>`;
    });
    h += `</tbody></table></div></div>`;
    el.innerHTML = h;
    $$('[data-od]', el).forEach((b) => (b.onclick = () => { openOpt[b.dataset.od] = !openOpt[b.dataset.od]; renderOptResults(); }));
    $$('[data-ol]', el).forEach((b) => (b.onclick = () => { S.calc = E.normalizeBuild(JSON.parse(JSON.stringify(r.results[+b.dataset.ol].build))); S.calc.name = 'From optimizer #' + (+b.dataset.ol + 1); save(); renderCalc(); showTab('calc'); }));
    $$('[data-oa],[data-ob]', el).forEach((b) => (b.onclick = () => { const i = +(b.dataset.oa ?? b.dataset.ob); const k = b.dataset.oa !== undefined ? 0 : 1; S.cmp[k] = E.normalizeBuild(JSON.parse(JSON.stringify(r.results[i].build))); S.cmp[k].name = `Optimizer #${i + 1}`; save(); renderCompare(); showTab('cmp'); }));
  }

  /* ---------------- compare ---------------- */
  function renderCompare() {
    ['a', 'b'].forEach((k, i) => {
      const el = $('#cmp-' + k); const b = S.cmp[i];
      el.innerHTML = `<h2>Build ${k.toUpperCase()}</h2><div class="row"><button class="btn" data-cp="${i}">Copy from calculator</button></div>` + editorHTML(b, 'cmp' + k);
      bindEditor(el, b, (full) => { save(); full ? renderCompare() : renderCompareOut(); });
      $('[data-cp]', el).onclick = () => { S.cmp[i] = Object.assign(JSON.parse(JSON.stringify(S.calc)), { name: 'Build ' + k.toUpperCase() }); save(); renderCompare(); };
    });
    renderCompareOut();
  }
  function explainCompare(ra, rb) {
    const fid = ra.formula; const a = ra.agg, b = rb.agg;
    if (ra.m1 === null || rb.m1 === null) {
      const aTerms = ra.m1PermTerms, bTerms = rb.m1PermTerms;
      if (!aTerms || !bTerms) return '<p class="warn">Total damage is unknown.</p>';
      const delta = bTerms.offset - aTerms.offset;
      const sameBaseContext = ra.build.weapon === rb.build.weapon && +ra.build.mastery === +rb.build.mastery && !aTerms.baseKnown && !bTerms.baseKnown && Math.abs(aTerms.coefficient - bTerms.coefficient) < 1e-10 && aTerms.rounding === 'none';
      return `<p class="warn">Base unknown: ${sameBaseContext ? 'with the same weapon and mastery, B cancels out in the difference.' : 'the two builds’ bases are not known to be equal; no total-damage winner is given.'}</p><p>AD × ADF contribution gap (B − A): ${delta >= 0 ? '+' : ''}${fmt(delta, 3)}. ${sameBaseContext ? 'This is also the M1 gap in this shared context.' : 'This is not necessarily the total M1 gap.'}</p>`;
    }
    const m1 = (x) => E.m1From(x, fid);
    const step1 = Object.assign({}, a, { base: b.base, baseKnown: true });
    const step2 = Object.assign({}, step1, { A: b.A });
    const step3 = Object.assign({}, step2, { Fprod: b.Fprod, Fsum: b.Fsum, clan: b.clan });
    const step4 = Object.assign({}, step3, { post: b.post, mult: b.mult });
    const dBase = m1(step1) - m1(a), dFlat = m1(step2) - m1(step1), dFac = m1(step3) - m1(step2), dTemp = m1(step4) - m1(step3);
    const dpsA = ra.dps, dpsB = rb.dps; const dAsf = rb.m1 * (rb.hitsPerSec - ra.hitsPerSec); const dM1dps = (rb.m1 - ra.m1) * ra.hitsPerSec;
    const nameA = esc(ra.build.name || 'A'), nameB = esc(rb.build.name || 'B');
    const win = rb.m1Perm > ra.m1Perm ? nameB : rb.m1Perm < ra.m1Perm ? nameA : null;
    const sgn = (v) => (v >= 0 ? '+' : '') + fmt(v, 3);
    const parts = [['base', dBase], ['flat AD', dFlat], ['factors (ADF + clan)', dFac], ['temporary bonuses / marks', dTemp]].filter((p) => Math.abs(p[1]) > 1e-9).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    let s = `<p><b>${win ? win + ' wins' : 'Tie'}</b> on permanent M1 per hit (${fmt(ra.m1Perm)} → ${fmt(rb.m1Perm)}).</p>`;
    s += `<p>M1 damage gap (B − A) = <b>${sgn(rb.m1 - ra.m1)}</b>, split by replacing A’s terms with B’s one at a time: ${parts.map((p) => `<span class="pill">${p[0]} ${sgn(p[1])}</span>`).join(' ') || 'no difference'}.</p>`;
    s += `<p>ΣAD: ${fmt(a.A, 3)} → ${fmt(b.A, 3)} · Π ADF: ${fmt(a.Fprod, 4)} → ${fmt(b.Fprod, 4)} · clan: ${fmt(a.clan * 100)} % → ${fmt(b.clan * 100)} % · hits/s: ${fmt(ra.hitsPerSec, 3)} → ${fmt(rb.hitsPerSec, 3)}.</p>`;
    s += `<p>On DPS: per-hit damage effect ≈ ${sgn(dM1dps)} /s, attack speed effect ≈ ${sgn(dAsf)} /s.</p>`;
    if (parts.length) { const top = parts[0][0]; s += `<p class="muted">The main driver is “${top}”. ${top.startsWith('flat') ? (fid === 'F6' ? 'With F6, only flat AD counts.' : 'The larger the total factor, the more each point of flat AD is worth.') : top.startsWith('factors') ? 'Factors multiply base + flat AD: the higher those are, the more a factor gives.' : ''}</p>`; }
    return s;
  }
  function renderCompareOut() {
    const fid = activeFormula(); const ra = E.evaluatePermanent(S.cmp[0], { formula: fid }), rb = E.evaluatePermanent(S.cmp[1], { formula: fid });
    const rows = [['Permanent M1 damage', 'm1Perm', 3, 'm1'], ['Known AD × ADF contribution (without base)', r => r.m1PermTerms?.offset, 3, null], ['Permanent hits/s', 'hitsPerSecPerm', 3, 'hps'], ['Permanent M1 DPS (info)', 'dpsPerm', 2, 'dps'], ['Permanent 5th hit (info)', 'm1FinPerm', 3, 'm1']];
    const secondary = new Map([[ra, BB.statTotals(ra.build)], [rb, BB.statTotals(rb.build)]]);
    [['Bonus HP', 'maxHealth'], ['Bonus stamina', 'maxStamina'], ['Movement (bonus %)', 'movementSpeedFactor'],
     ['Damage reduction (bonus %)', 'damageReductionFactor'], ['Bonus block points', 'blockPoints'],
     ['HP regen (bonus %)', 'healthRegen']].forEach(([label, key]) => rows.push([label, (r) => secondary.get(r)[key] * (/Factor|Regen/.test(key) ? 100 : 1), 2, null]));
    const get = (r, k) => (typeof k === 'function' ? k(r) : r[k]);
    let h = `<h2>Permanent M1 comparison</h2><table><thead><tr><th>Metric</th><th class="num">${esc(S.cmp[0].name)}</th><th class="num">${esc(S.cmp[1].name)}</th><th class="num">Gap (B−A)</th><th class="num">%</th></tr></thead><tbody>`;
    rows.forEach(([l, k, d, c]) => { const x = get(ra, k), y = get(rb, k); const df = x === null || y === null || x === undefined || y === undefined ? null : y - x;
      h += `<tr><td>${l}</td><td class="num">${x === null || x === undefined ? '<span class="muted">no data</span>' : fmt(x, d)}</td><td class="num">${y === null || y === undefined ? '<span class="muted">no data</span>' : fmt(y, d)}</td><td class="num ${df > 0 ? 'pos' : df < 0 ? 'neg' : ''}">${df === null ? '—' : (df >= 0 ? '+' : '') + fmt(df, d)}</td><td class="num">${df === null || !x ? '—' : fmt((df / x) * 100, 2) + ' %'}</td></tr>`; });
    h += `</tbody></table>${[ra, rb].map((r, i) => r.validation.errs.map((e) => `<div class="err">⛔ ${i ? 'B' : 'A'} : ${esc(e)}</div>`).join('')).join('')}<h3>Why?</h3><div class="explain">${explainCompare(ra, rb)}</div>`;
    $('#cmp-out').innerHTML = h;
  }

  /* ---------------- database ---------------- */
  let dbTab = 'weapons', dbQ = '';
  /* skill names: official names from data/moves.json (+ cooldown if known), then community-reported forms unless they contradict the official names */
  const artSkills = (x) => {
    const off = ((D.moves.data || {})[x.name] || []).filter((m) => m.name).map((m) => `${m.key && m.key !== m.name ? m.key + ' ' : ''}${m.name.replace(/ \(\?\)$/, '')}${m.cooldown ? ' (CD ' + m.cooldown + ' s)' : ''}`);
    const sq = (t) => t.toLowerCase().replace(/[^a-z]/g, ''); const offN = off.map(sq);
    const rep = x.reportedFormsConflictsOfficial ? [] : (x.reportedForms || []).filter((f) => !offN.some((o) => o.includes(sq(f))));
    return off.concat(rep).join(' · ');
  };
  function renderDB() {
    const el = $('#db');
    const tabs = { weapons: 'Weapons', equipment: 'Equipment', clans: 'Clans', titles: 'Titles', breathings: 'Breathings', bdas: 'Blood Demon Arts', fightingstyles: 'Fighting styles', skills: 'Skills', ...(D.objects ? { objects: 'All items' } : {}), quests: 'Quests and rewards', skilltree: 'Skill tree', buffs: 'Buffs / effects', effects: 'Modelled effects' };
    const own = new Set(S.owned);
    const norm = window.PS2Combobox.norm;
    const skills = Object.entries(D.moves.data || {}).flatMap(([art, moves]) => moves.map((m) => ({ ...m, art })));
    const quests = D.obtain.data.quests || [];
    const list = dbTab === 'skills' ? skills : dbTab === 'quests' ? quests : D[dbTab].data || [];
    const literalSummary = data => Object.entries(data || {}).filter(([, v]) => typeof v === 'string' || typeof v === 'number' || v && typeof v.Quantity === 'number').map(([k, v]) => `${k} : ${typeof v === 'object' ? v.Quantity : v}`).join(' ; ');
    const ownCol = ['weapons', 'equipment', 'clans'].includes(dbTab);
    const cols = {
      weapons: [['Faction', (x) => x.faction || '?'], ['Type', (x) => x.type], ['Series', (x) => x.series], ['AD', (x) => x.additionalDamage, 1], ['ADF', (x) => x.additionalDamageFactor, 1], ['BP', (x) => x.blockPoints, 1], ['Other', (x) => fmtStats(x.otherStats)], ['How to get', (x) => x.obtain], ['Passives / notes', (x) => [(x.passives || []).map((p) => p.name).join(' ; '), x.notes].filter(Boolean).join(' · ')]],
      equipment: [['Type', (x) => E.itemLabel(x)], ['Rarity', (x) => x.rarity], ['Class', (x) => x.itemClass], ['AD', (x) => x.additionalDamage, 1], ['ADF', (x) => x.additionalDamageFactor, 1], ['BP', (x) => x.blockPoints ?? (x.otherStats || {}).blockPoints, 1], ['Other', (x) => fmtStats(x.otherStats)], ['How to get', (x) => x.unobtainable ? 'Not obtainable' : x.obtain]],
      clans: [['Rarity', (x) => x.rarity], ['ADF %', (x) => x.additionalDamageFactorPct, 1], ['HP', (x) => x.maxHealth, 1], ['Effects', (x) => (x.effects || []).map((e) => e.name + (e.text ? ' : ' + e.text : '')).join(' ; ')], ['Notes', (x) => x.notes]],
      titles: [['Category', (x) => TCAT_FR[x.category] || x.category], ['Buff (equipped)', (x) => fmtStats(x.buffWhileEquipped) || (x.category === 'mastery' ? '' : 'not published')], ['Passive (unlocked)', (x) => fmtStats(x.passiveAlwaysOn)], ['Requirement', (x) => x.requirement]],
      breathings: [['Unlock', (x) => [x.unlock, x.trainer ? 'Trainer: ' + x.trainer : ''].filter(Boolean).join(' · ')], ['Skills', artSkills], ['Recent changes', (x) => (x.recentChanges || []).join(' · ')]],
      bdas: [['Other names', (x) => (x.aliases || []).join(', ')], ['Skills', artSkills], ['Recent changes', (x) => (x.recentChanges || []).join(' · ')]],
      fightingstyles: [['Skills', artSkills], ['Recent changes', (x) => (x.recentChanges || []).join(' · ')], ['Notes', (x) => x.notes]],
      skills: [['Art / style', (x) => x.art], ['Key / id', (x) => x.key], ['Cooldown (s)', (x) => x.cooldown, 1], ['Stamina', (x) => x.stamina, 1], ['Max hold (s)', (x) => x.maxHold, 1], ['Boss', (x) => x.boss], ['Measured damage', (x) => x.damage, 1]],
      quests: [['NPC', x => x.npc], ['Region', x => x.region], ['Rewards', x => literalSummary(x.rewards)], ['Requirements', x => literalSummary(x.requirements)], ['Source', x => x.evidence.module]],
      objects: [['Family', (x) => x.group], ['Equip type', (x) => x.equipType], ['Rarity', (x) => x.rarity], ['Class', (x) => x.itemClass], ['Raw stats', (x) => Object.entries(x.stats || {}).map(([k, v]) => `${k}: ${v}`).join('; ')], ['How to get', (x) => x.unobtainable ? 'Not obtainable' : x.obtain], ['Shops / prices', (x) => (x.shops || []).map((s) => `${s.npc} (${s.region})${s.offer.price ? ': ' + Object.entries(s.offer.price).map(([k, v]) => `${v} ${k}`).join(' + ') : ': price —'}`).join('; ')], ['Description', (x) => x.description]],
      skilltree: [['AD', (x) => x.additionalDamage, 1], ['Notes', (x) => x.notes]],
      buffs: [['Type', (x) => x.type], ['Details', (x) => Object.entries(x).filter(([k]) => !['name', 'sources', 'sourceType', 'date', 'patch', 'confidence', 'type', 'faction'].includes(k)).map(([k, v]) => k + ' : ' + (typeof v === 'object' ? JSON.stringify(v) : v)).join(' · ')]],
      effects: [['Owner', (x) => x.owner], ['Requires', (x) => x.requires.concat(x.conds).join(', ')], ['Stats', (x) => JSON.stringify(x.stats)], ['Note', (x) => x.note]],
    }[dbTab];
    let h = `<h2>Database</h2><div class="subtabs">${Object.entries(tabs).map(([k, l]) => `<button class="btn ${k === dbTab ? 'active' : ''}" data-dbt="${k}">${l} (${k === 'skills' ? skills.length : k === 'quests' ? quests.length : D[k].data.length})</button>`).join('')}</div>
      <div class="row"><input id="db-q" type="search" placeholder="Search a name (e.g. lant)…" value="${esc(dbQ)}" style="width:260px" autocomplete="off"> <span class="small muted" id="db-count"></span></div>
      <div class="tbl-wrap"><table><thead><tr>${ownCol ? '<th>Owned</th>' : ''}<th>Name</th>${cols.map((c) => `<th${c[2] ? ' class="num"' : ''}>${c[0]}</th>`).join('')}<th>Patch</th></tr></thead><tbody>`;
    if (dbTab === 'objects' || dbTab === 'skills') {
      h = h.replace('<div class="tbl-wrap">', `<p class="small muted">Game definitions: being listed does not mean an item is currently obtainable. — = no information. ${dbTab === 'skills' ? 'Max hold is not a cast time; cooldowns do not give damage.' : 'Raw stats are the module values, before conversion to displayed factors.'}</p><div class="tbl-wrap">`);
    }
    list.forEach((x) => {
      const srcs = x.sources ? E.entrySources(x) : x.sourceKeys ? E.srcOf(x.sourceKeys) : [];
      h += `<tr data-q="${esc(norm([x.name, x.art, x.group, x.obtain, x.npc, x.region, dbTab === 'quests' ? literalSummary(x.rewards) : ''].filter(Boolean).join(' ')))}">${ownCol ? `<td><input type="checkbox" data-own="${esc(x.name)}" ${own.has(x.name) ? 'checked' : ''}></td>` : ''}<td><b>${esc(x.name)}</b></td>${cols.map((c) => { const v = (dbTab === 'objects' || dbTab === 'skills' || dbTab === 'quests') ? c[1](x) : clean(c[1](x)); return `<td${c[2] ? ' class="num"' : ''}>${v === null || v === undefined || v === '' ? '<span class="muted">—</span>' : esc(v)}</td>`; }).join('')}<td class="small">${esc(x.patch || '')}</td></tr>`;
    });
    h += '</tbody></table></div>';
    el.innerHTML = h;
    $$('[data-dbt]', el).forEach((b) => (b.onclick = () => { dbTab = b.dataset.dbt; renderDB(); }));
    const applyQ = () => { const q = norm(dbQ.trim()); let n = 0; $$('tbody tr[data-q]', el).forEach((tr) => { const ok = !q || tr.dataset.q.includes(q); tr.classList.toggle('db-hide', !ok); if (ok) n++; }); $('#db-count').textContent = `${n} / ${list.length} entries`; };
    $('#db-q').oninput = (ev) => { dbQ = ev.target.value; applyQ(); };
    applyQ();
    $$('[data-own]', el).forEach((c) => (c.onchange = () => { const s = new Set(S.owned); c.checked ? s.add(c.dataset.own) : s.delete(c.dataset.own); S.owned = [...s]; save(); invalidateSearchResults(); }));
  }

  /* ---------------- patch page ---------------- */
  function renderPatch() {
    const p = D.patches.data.slice().reverse();
    let h = `<h2>Patches & last update</h2>
      <div class="cards"><div class="card"><div class="k">Current patch</div><div class="v">${C.version.patch}</div><div class="pt">${C.version.patchDate} · V0.182 notes included</div></div>
      <div class="card"><div class="k">Data compiled</div><div class="v" style="font-size:18px">${C.version.dataCompiled}</div><div class="pt">data.js bundle: ${esc(D._meta.bundledAt)}</div></div>
      <div class="card"><div class="k">Last Roblox update</div><div class="v" style="font-size:18px">09/26 20:34 UTC</div><div class="pt">V0.182 release.</div></div></div>
      <h3>Patch timeline</h3><table><thead><tr><th>Patch</th><th>Date</th><th>Changes</th></tr></thead><tbody>`;
    p.forEach((x) => { h += `<tr><td><b>${esc(x.patch)}</b></td><td>${esc(x.date)}</td><td><ul style="margin:0;padding-left:16px">${x.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>${x.blockDamageOnly ? `<div class="small muted">Block damage only (not counted in DPS): ${x.blockDamageOnly.map(esc).join(' ; ')}</div>` : ''}</td></tr>`; });
    h += `</tbody></table><div class="small muted">Version numbering is inconsistent (V0.98, v0.110, V.12, v0.140, V0.17, V0.18, V0.182): patches are sorted by date. Patch notes are only published on the official Discord.</div>`;
    $('#patch').innerHTML = h;
  }



  /* ---------------- help ---------------- */
  function renderHelp() {
    $('#help').innerHTML = `<h2>Using the calculator</h2>
      <h3>My build</h3><p>Pick your weapon, weapon mastery, equipment, clan and titles. M1 damage updates automatically. Only enable the buffs you actually use.</p>
      <h3>Best build</h3><p>Pick your faction; the best permanent M1 build is calculated at max mastery (400), T3 R10. The ranking excludes conditional effects: no mode, mark, Combat Intuition or burst. To limit the search to your items or change tiers, open “Customize the search”.</p>
      <h3>How the build is chosen</h3><p>The engine reads the catalogue stats, generates every valid combination of weapon, up to five distinct items, clan and three titles, then calculates (base + permanent AD) × permanent ADF. It groups equivalent candidates and drops those beaten on every relevant stat to avoid redundant work.</p>
      <h3>Formula</h3><p>M1 = (base + AD) × ADF; 5th hit = (2 × base + AD) × ADF; base = 3 + 0.027 × weapon mastery. AD and ADF are the two numbers of the in-game Stats HUD. Stat bonuses and effects on combat damage are separate; the result details show each step.</p>`;
  }


  /* ---------------- best build ---------------- */
  const BB = window.PS2Best;
  S.best = Object.assign({ faction: 'slayer', goal: 'm1', rank: 'm1', tier: 3, refine: 10, weapon: '', art: '', ownedOnly: false, allowDuplicates: false, effectScope: 'permanent' }, S.best || {});
  S.best.goal = 'm1'; S.best.effectScope = 'permanent'; S.best.art = '';
  S.best.allowDuplicates = false;
  let lastBest = null;
  const WTYPE_FR = { katana: 'Katana', sickles: 'Sickles', claws: 'Claws', scythe: 'Scythe', gauntlet: 'Gauntlet', axe_mace: 'Axe and mace', tanto: 'Tanto', spear: 'Spear', war_fans: 'War fans', bladed_wagasa: 'Bladed wagasa', shotgun: 'Shotgun', 'katana (sound cleavers)': 'Cleavers (Sound)', cutlass: 'Cutlass', fist: 'Fists' };
  const NO_OBTAIN = '—';
  const fr = (v, d) => (v === null || v === undefined || isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d ?? 2, minimumFractionDigits: 0 }));
  const pct = (v, d) => (v >= 0 ? '+' : '') + fr(v * 100, d ?? 1) + ' %';
  function ownedPickerHTML(id) {
    const owned = new Set(S.owned);
    const entries = [...E.equippable().map(x => [x, 'Equipment']), ...D.weapons.data.filter(x => !x.unobtainable).map(x => [x, 'Weapon']), ...D.clans.data.map(x => [x, 'Clan'])];
    return `<details class="owned-picker" data-owned-picker="${id}"><summary>My available items <span data-owned-count>(${S.owned.length})</span></summary><p class="small muted">Select the items and clans to consider. This list is shared with the other optimizer.</p><div class="row"><input type="search" data-owned-search placeholder="Search a weapon, item or clan…" aria-label="Search my available items"><button type="button" class="btn" data-owned-current>Add the items of my build</button></div><div style="max-height:180px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px">${entries.map(([x, group]) => `<label style="min-width:0" data-owned-row data-search="${esc(window.PS2Combobox.norm(x.name + ' ' + group))}"><input type="checkbox" data-owned-item="${esc(x.name)}" ${owned.has(x.name) ? 'checked' : ''}> ${esc(x.name)} <span class="small muted">${group}</span></label>`).join('')}</div></details>`;
  }
  function bindOwnedPicker(el) {
    const root = $('[data-owned-picker]', el); if (!root) return;
    const refresh = () => {
      $$('[data-owned-item]').forEach(x => { x.checked = S.owned.includes(x.dataset.ownedItem); });
      $$('[data-owned-count]').forEach(x => { x.textContent = `(${S.owned.length})`; });
    };
    const invalidateSearch = () => {
      invalidateSearchResults();
      if ($('#tab-best').classList.contains('active') && S.best.ownedOnly) scheduleBest();
      const st = $('#o-status'); if (st) st.textContent = 'Items changed: run the optimization again.';
    };
    const search = $('[data-owned-search]', root); search.onchange = null;
    search.oninput = (ev) => {
      const q = window.PS2Combobox.norm(ev.target.value);
      $$('[data-owned-row]', root).forEach(x => { x.style.display = x.dataset.search.includes(q) ? '' : 'none'; });
    };
    $$('[data-owned-item]', root).forEach(x => { x.onchange = () => {
      const own = new Set(S.owned); x.checked ? own.add(x.dataset.ownedItem) : own.delete(x.dataset.ownedItem);
      S.owned = [...own]; save(); refresh(); invalidateSearch();
    }; });
    $('[data-owned-current]', root).onclick = () => {
      S.owned = [...new Set([...S.owned, S.calc.weapon, S.calc.clan, ...E.equipList(S.calc)].filter(Boolean))];
      save(); refresh(); invalidateSearch();
    };
  }
  let bestFormKey;
  function renderBestForm() {
    const o = S.best; const el = $('#best-form');
    const arts = o.faction === 'slayer' ? D.breathings.data : D.bdas.data;
    const ws = D.weapons.data.filter((w) => E.factionAllowed(w.faction, o.faction, S.calc.rules) && !D.rules.optimizerExcludeWeapons.includes(w.name));
    const types = [...new Set(ws.map((w) => w.type))];
    if (o.weapon && !((o.weapon.startsWith('type:') && types.includes(o.weapon.slice(5))) || (o.weapon.startsWith('w:') && ws.some((w) => 'w:' + w.name === o.weapon)))) o.weapon = '';
    if (o.art && !arts.some((a) => a.name === o.art)) o.art = '';
    const calc = S.calc;
    const key = JSON.stringify([o, calc.level, calc.skillNodes, calc.rules, calc.toggles, calc.conds, calc.inputs, calc.target, S.owned]);
    if (key === bestFormKey && el.firstChild) return;
    bestFormKey = key;
    const byDps = o.rank === 'dps';
    replaceHTML(el, `<h2>Best permanent ${byDps ? 'M1 DPS' : 'M1'} build</h2>
      <p class="small muted">${byDps ? `Ranked by permanent M1 DPS over a whole kill of a ${S.targetHp.toLocaleString('en-US')} HP target: average hit of the 5-hit chain × hits per second (the game's cadence), plus the Nightfall bleed, plus Nightfall Hunt (+15 % on the last 30 % of HP) when the T3 top and bottom are worn. At max mastery; no mode, mark or Combat Intuition.` : 'Ranked by permanent damage of the normal M1, at max mastery. No mode, mark, Combat Intuition or conditional state. The 5th hit and DPS do not decide the build.'}</p>
      <div class="row"><label>Faction</label><select id="bb-fac">${opt('slayer', 'Slayer', o.faction === 'slayer')}${opt('demon', 'Demon', o.faction === 'demon')}<option disabled>Hybrid (WIP)</option></select></div>
      <div class="row"><label>${o.faction === 'slayer' ? 'Breathing' : 'Blood Demon Art'}</label><select id="bb-art">${opt('', 'Any (the weapon must carry at least one)', !o.art)}${arts.map((a) => opt(a.name, a.name, o.art === a.name)).join('')}</select><span class="small muted">Only weapons that can use it are searched.</span></div>
      <div class="row"><label>Rank by</label><select id="bb-rank">${opt('m1', 'Damage per hit (M1)', !byDps)}${opt('dps', 'M1 DPS over a whole kill (bleed, Nightfall Hunt)', byDps)}</select></div>
      <details id="best-settings" class="secondary-tools"><summary>Customize the search</summary><div class="grid2" style="margin-top:8px">
        <div class="row"><label>Tier / refine</label><select id="bb-tier" aria-label="Tier">${[1, 2, 3].map((t) => opt(t, 'T' + t, +o.tier === t)).join('')}</select><select id="bb-refine" aria-label="Refine">${[...Array(11).keys()].map((r) => opt(r, 'R' + r, +o.refine === r)).join('')}</select></div>
        <div class="row"><label>Weapon</label><select id="bb-weapon">${opt('', 'Any (best)', !o.weapon)}<optgroup label="Weapon type">${types.map((t) => opt('type:' + t, WTYPE_FR[t] || t, o.weapon === 'type:' + t)).join('')}</optgroup><optgroup label="Fixed weapon">${ws.map((w) => opt('w:' + w.name, w.name, o.weapon === 'w:' + w.name)).join('')}</optgroup></select></div>
      </div>
      <div class="row small">
        <label style="min-width:auto"><input type="checkbox" id="bb-owned" ${o.ownedOnly ? 'checked' : ''}> Only my available items</label>
      </div>
      ${ownedPickerHTML('best')}
      <div class="row"><button class="btn" id="bb-run">Calculate with my constraints</button></div></details>
      <div class="row"><button class="primary" id="bb-max-m1">Optimize permanent ${byDps ? 'M1 DPS' : 'M1'} — T3 / R10</button><button class="btn" id="bb-cancel">Cancel</button><span id="bb-status" class="muted small"></span></div>`);
    const sync = () => { const f = $('#bb-fac').value; Object.assign(o, { faction: f, goal: 'm1', effectScope: 'permanent', tier: +$('#bb-tier').value, refine: +$('#bb-refine').value, weapon: f === o.faction ? $('#bb-weapon').value : '', art: f === o.faction ? $('#bb-art').value : '', rank: $('#bb-rank').value, ownedOnly: $('#bb-owned').checked, allowDuplicates: false }); save(); };
    $$('select,input', el).forEach((x) => (x.onchange = () => {
      const oldFaction = o.faction; sync();
      if (oldFaction !== o.faction) renderBestForm();
      scheduleBest();
    }));
    bindOwnedPicker(el);
    $('#bb-run').onclick = () => { sync(); runBest(); };
    $('#bb-max-m1').onclick = () => {
      sync(); Object.assign(o, { goal: 'm1', effectScope: 'permanent', tier: 3, refine: 10, allowDuplicates: false, weapon: '', ownedOnly: false });
      save(); renderBestForm(); runBest();
    };
    $('#bb-cancel').onclick = () => { clearTimeout(bestTimer); ++bestRequest; window.PS2Search.cancel('best'); $('#bb-status').textContent = 'Cancelled.'; };
    if (window.PS2Search.active.includes('best')) $('#bb-status').textContent = 'Calculating in the background…';
  }
  let bestTimer, bestRequest = 0;
  function invalidateSearchResults() {
    clearTimeout(bestTimer); ++optRequest; ++bestRequest;
    window.PS2Search.cancel('opt'); window.PS2Search.cancel('best');
    lastOpt = null; lastBest = null;
    renderOptResults(); renderBestOut();
    const st = $('#bb-status'); if (st) st.textContent = 'Settings changed: calculate again.';
    const ot = $('#o-status'); if (ot) ot.textContent = 'Settings changed: run the optimization again.';
  }
  function scheduleBest() {
    clearTimeout(bestTimer); ++bestRequest; window.PS2Search.cancel('best');
    lastBest = null; renderBestOut();
    const st = $('#bb-status'); if (st) st.textContent = 'Settings changed…';
    bestTimer = setTimeout(runBest, 180);
  }
  async function runBest() {
    clearTimeout(bestTimer);
    const o = { ...S.best, goal: 'm1', effectScope: 'permanent' }, request = ++bestRequest; const st = $('#bb-status'); if (st) st.textContent = 'Calculating in the background…';
      const result = await window.PS2Search.run('best', { objective: o.rank === 'dps' ? 'dps-permanent' : 'm1-permanent', faction: o.faction, goal: o.rank === 'dps' ? 'dps' : 'm1', bleedHp: o.rank === 'dps' ? S.targetHp : 0, tier: o.tier, refine: o.refine, fixedWeapon: o.weapon.startsWith('w:') ? o.weapon.slice(2) : '', weaponType: o.weapon.startsWith('type:') ? o.weapon.slice(5) : '',
        art: o.art || '', effectScope: 'permanent', ownedOnly: o.ownedOnly, owned: new Set(S.owned), allowDuplicates: false, calc: S.calc, formula: activeFormula(), weaponOverrides: S.weaponOverrides }, S.moves);
      if (request !== bestRequest || result.cancelled) return;
      lastBest = result;
      const s2 = $('#bb-status'); if (s2) s2.textContent = lastBest.error ? '' : lastBest.cacheHit ? 'Same result taken from cache.' : `${lastBest.stats.evals.toLocaleString('en-US')} combinations evaluated in ${lastBest.stats.ms} ms`;
      renderBestOut();
  }
  const obtainOf = (x) => (x && x.obtain) || NO_OBTAIN;
  function refineText(b) {
    if (!b.refine) return '';
    const c = BB.refineCost(b.refine); const R = (D.obtain && D.obtain.data.refine) || {};
    return `Refine R${b.refine} at ${R.npc || 'Refiner Hagane'}: ${fr(c.ore, 0)} Refinement Ore + ${fr(c.mythic, 0)} Mythic Refinement Ore + ${fr(c.wen, 0)} Wen for successful steps (each step can fail; Refinement Guard protects). ${R.smelt || ''}. ${R.oreSource || ''}.`;
  }
  function bestRows(b) {
    const w = E.IDX.weapons[b.weapon]; const rows = [];
    rows.push(['Weapon', `${esc(b.weapon)} <span class="muted small">T${b.tier} R${b.refine}</span>`, esc(obtainOf(w)) + (b.refine ? `<div class="bb-ref">${esc(refineText(b))}</div>` : '')]);
    E.equipSlots(b).forEach(({ n, tier }, i) => { const it = E.IDX.equipment[n]; rows.push([`Item ${i + 1}`, `${tchip(it)} ${esc(n)}${it && it.series ? ` <span class="chip">T${tier}</span>` : ''}`, esc(obtainOf(it))]); });
    for (let i = E.equipSlots(b).length; i < D.rules.maxEquipSlots; i++) rows.push([`Item ${i + 1}`, '<span class="muted">— free —</span>', '']);
    const c = b.clan && E.IDX.clans[b.clan]; rows.push(['Clan', esc(b.clan || '— none —'), c ? esc(obtainOf(c)) : '']);
    b.titles.forEach((t, i) => { const x = t && E.IDX.titles[t]; rows.push([`Title ${i + 1}`, esc(t || '— none —'), x ? esc(obtainOf(x)) : '']); });
    const art = b.art && (E.IDX.breathings[b.art] || E.IDX.bdas[b.art]); const carry = b.weapon ? E.weaponArts(E.IDX.weapons[b.weapon], b.faction) : null;
    rows.push([b.faction === 'slayer' ? 'Breathing' : 'Blood Demon Art', esc(b.art || '— none —') + (carry ? ` <span class="small muted">(${esc(b.weapon)} carries: ${carry.length === (b.faction === 'slayer' ? D.breathings.data : D.bdas.data).length ? 'all' : carry.length ? carry.map(esc).join(', ') : 'none'})</span>` : ''), art ? esc(obtainOf(art)) : '']);
    const fs = b.style && (D.fightingstyles.data.find((s) => s.name === b.style)); rows.push(['Fighting style', esc(b.style || 'Combat (default)'), fs ? esc(obtainOf(fs)) : 'Base style, nothing to learn.']);
    const P = D.progression.data;
    if (b.faction === 'demon') rows.push(['Demon Progress', `Lv. ${b.demonProgress || 0}`, esc(P.demonProgress.obtain || '')]);
    else rows.push(['Slayer Progress', 'Any', esc((P.slayerProgress || {}).obtain || '')]);
    return rows;
  }
  function goalStats(g, x) {
    const ev = x.ev, st = x.st; const cards = ev.m1Perm === null ? [['Known permanent contribution', fr(ev.m1PermTerms.offset), 'AD × ADF — without base B, not total damage'], ['Permanent M1', damageExpression(ev.m1PermTerms), 'B unknown for this weapon'], ['Permanent 5th hit', damageExpression(ev.finPermTerms), 'For information, not the ranking criterion']] : [['Permanent M1', fr(ev.m1Perm), 'damage per hit'], ['Permanent 5th hit', fr(ev.m1FinPerm), 'damage — info'], ['Permanent M1 DPS', fr(ev.dpsPerm), 'damage/s — info']];
    if (g === 'skills') cards.unshift(['Skill multiplier', '×' + fr(ev.skill.mult.mult, 4), (ev.skill.mult.parts || []).map((p) => p[0]).join(', ') || 'no bonus']);
    if (g === 'speed') cards.unshift(['Movement speed', pct(st.movementSpeedFactor), 'Movement Speed Factor'], ['Hits per second', fr(st.hitsPerSec, 3), `attack speed ${pct(st.attackSpeed)}`]);
    if (g === 'tank') cards.unshift(['Effective HP (bonus)', fr(st.ehp, 0), 'HP ÷ (1 − reduction)'], ['Bonus HP', fr(st.hp, 0), `+${fr(st.maxHealth, 0)} HP, ${pct(st.maxHealthFactor)} max HP`], ['Damage reduction', pct(st.damageReductionFactor), `+${fr(st.damageReduction, 2)} flat reduction`], ['Block', fr(st.blockPoints, 2) + ' pts', `block regen ${pct(st.blockRegen)}, HP regen ${pct(st.healthRegen)}`]);
    return cards.map(([k, v, s]) => `<div class="card"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="small muted">${esc(s)}</div></div>`).join('');
  }
  /* Same items / weapon / titles as the best build, every clan, with the skills that switch on for a limited time
     (marks such as Enhanced Hearing, modes such as Heart Ablaze). Combat Intuition, Vital Draw and Repetitive Action
     need a number the site cannot know, so they are not counted. Ranking above is untouched (permanent M1 only). */
  function clanSkillsHTML(b) {
    const rows = [];
    D.clans.data.forEach((c) => {
      const bb = E.normalizeBuild(Object.assign(JSON.parse(JSON.stringify(b)), { clan: c.name, toggles: { mode: true, mark: true }, conds: {} }));
      const ev = E.evaluate(bb, { formula: activeFormula(), contributions: false });
      if (ev.m1 === null || ev.m1Perm === null) return;
      const skills = E.activeEffects(bb).filter((z) => z.active && (z.e.requires.includes('mark') || z.e.requires.includes('mode')));
      rows.push({ name: c.name, perm: ev.m1Perm, act: ev.m1, skills, ci: (E.IDX.effectsByOwner[c.name] || []).some((e) => e.stats.ciConversion) });
    });
    if (!rows.length) return '';
    rows.sort((x, y) => y.act - x.act || y.perm - x.perm);
    const top = rows.slice(0, 8);
    const cur = rows.find((x) => x.name === b.clan);
    if (cur && !top.includes(cur)) top.push(cur);
    const trs = top.map((x) => `<tr${x.name === b.clan ? ' class="bb-cur"' : ''}><td class="bb-k">${esc(x.name)}${x.name === b.clan ? ' <span class="muted small">(this build)</span>' : ''}</td><td>${fr(x.perm, 2)}</td><td><b>${fr(x.act, 2)}</b>${x.act > x.perm + 1e-9 ? ` <span class="muted small">+${fr((x.act / x.perm - 1) * 100, 1)} %</span>` : ''}</td><td class="small muted">${x.skills.length ? x.skills.map((z) => esc(clean(z.e.skillName || z.e.name)) + (z.e.durationSec ? ` ${z.e.durationSec} s` + (z.e.cooldownSec ? ` / cd ${z.e.cooldownSec} s` : '') : '')).join(' · ') : (x.ci ? 'Combat Intuition: needs a damage number' : '—')}</td></tr>`).join('');
    return `<details class="panel secondary-tools" id="bb-clans"><summary>Same build, other clans — with their timed skills</summary>
      <p class="small muted">Same weapon, items and titles. “With skills” switches on the clan's mark or mode (Enhanced Hearing, Heart Ablaze…) for its duration only. Combat Intuition, Vital Draw and Repetitive Action need a damage number and are not counted. The ranking above stays permanent M1.</p>
      <div class="bb-wrap"><table class="bb-table"><thead><tr><th>Clan</th><th>Permanent M1</th><th>With skills</th><th>Skill (duration / cooldown)</th></tr></thead><tbody>${trs}</tbody></table></div></details>`;
  }
  function renderBestOut() {
    const el = $('#best-out'); const r = lastBest; if (!r) { el.innerHTML = ''; return; }
    if (r.error) { el.innerHTML = `<div class="panel err">⛔ ${esc(r.error)}</div>`; return; }
    if (!r.results.length) { el.innerHTML = '<div class="panel err">No build found.</div>'; return; }
    const x = r.results[0], b = x.build;
    const partial = r.scoreKind === 'additional-m1';
    const scoreTxt = { dps: 'M1 DPS', m1: 'damage per hit', burst: '5th hit damage', skills: 'skill multiplier', speed: 'movement × hits/s', tank: 'bonus effective HP' }[r.goal.id];
    let h = `<div class="panel bb-card" id="bb-card"><h2>${partial ? 'Optimized permanent M1 contribution' : r.goal.id === 'dps' ? 'Optimized permanent M1 DPS over a whole kill' : 'Optimized permanent M1 damage'} <span class="small muted">${b.faction === 'slayer' ? 'Slayer' : 'Demon'} · T${S.best.tier} R${S.best.refine}</span></h2>
      ${partial ? '<div class="warn small" data-base-unresolved>Base B unknown: ranked on AD × ADF only, not on total damage.</div>' : ''}${ciScenarioHTML(x.ev)}
      <div class="small">Required effects: ${E.activeEffects(b).filter(z => z.active).map(z => esc(z.e.name)).join(' · ') || 'no conditional effect'}.</div>
      <details class="secondary-tools" data-search-explanation><summary>How this build was calculated</summary><p class="small">Catalogue read, valid combinations generated, equivalent candidates grouped and dominated ones removed, then ranked by ${partial ? 'the known permanent AD × permanent ADF contribution.' : '(base + permanent AD) × permanent ADF.'}</p><p class="small">${r.stats.evals.toLocaleString('en-US')} candidates calculated after reduction. Modes, marks, buffs, Combat Intuition, skill damage and cadence do not decide the ranking.</p></details>
      <details class="secondary-tools"><summary>Result conditions</summary>${r.assumptions && r.assumptions.length ? `<ul class="small muted">${r.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      ${x.ev.hitStages ? hitStagesHTML(x.ev) : ''}
      <div class="small">${flagChips(x.ev.flags)}</div>
      </details>
      <div class="cards cards-sm bb-stats">${goalStats(r.goal.id, x)}</div>
      ${bleedHTML(b, x.ev.dpsPerm ?? x.ev.dps)}
      <div class="bb-wrap"><table class="bb-table"><thead><tr><th>Slot</th><th>Choice</th></tr></thead><tbody>
      ${bestRows(b).filter(([k]) => !['m1', 'dps', 'burst'].includes(r.goal.id) || !['Fighting style', 'Slayer Progress'].includes(k)).map(([k, v]) => `<tr><td class="bb-k">${esc(k)}</td><td class="bb-v">${v}</td></tr>`).join('')}
      </tbody></table></div>
      <details class="secondary-tools"><summary>Where to get these items and refine cost</summary>${bestRows(b).filter(([, , o]) => o).map(([k, v, o]) => `<p class="small"><b>${esc(k)} — ${v}</b><br>${o}</p>`).join('')}</details>
      <div class="row"><button class="primary" data-bbl="0">Load in calculator</button><button class="btn" id="bb-craft">Materials for this build</button></div></div>`;
    h += clanSkillsHTML(b);
    if (r.results.length > 1) {
      h += `<details class="panel secondary-tools"><summary>Other close builds</summary><div class="bb-alts">`;
      r.results.slice(1).forEach((y, i) => {
        const yb = y.build; const diffItems = yb.equipment.filter((n, j) => n !== b.equipment[j] || !b.equipment.includes(n));
        h += `<div class="bb-alt"><div><b>#${i + 2}</b> <span class="muted small">${partial ? 'Known AD × ADF contribution' : esc(scoreTxt)}: ${fr(y.score, r.goal.id === 'skills' ? 4 : 2)} · M1 ${damageExpression(y.ev.m1PermTerms) || 'UNKNOWN'} · 5th hit ${damageExpression(y.ev.finPermTerms) || 'UNKNOWN'}</span></div>
          <div class="small">${esc(yb.weapon)} T${yb.tier} R${yb.refine} · ${esc(yb.clan || 'no clan')} · ${esc(yb.art || '')}</div>
          <div class="small muted">${yb.equipment.map(esc).join(', ')}</div><div class="small muted">${yb.titles.filter(Boolean).map(esc).join(' / ')}</div>
          <button class="btn" data-bbl="${i + 1}">Load in calculator</button></div>`;
      });
      h += `</div></details>`;
    }
    el.innerHTML = h;
    bindHp(el, () => (S.best.rank === 'dps' ? (renderBestForm(), runBest()) : renderBestOut()));
    $('#bb-craft', el).onclick = () => { window.PS2Acquisition.useBuild(b); showTab('craft'); };
    $$('[data-bbl]', el).forEach((bt) => (bt.onclick = () => { const i = +bt.dataset.bbl; S.calc = E.normalizeBuild(JSON.parse(JSON.stringify(r.results[i].build))); S.calc.name = `Best build (${r.goal.id}) #${i + 1}`; save(); renderCalc(); showTab('calc'); }));
  }

  function renderAll() {
    renderCalc(); renderBestForm(); renderBestOut();
    // Heavy comparison editors and derived validation tables are not built
    // while hidden. Opening their tab renders them against current state.
    if ($('#tab-cmp').classList.contains('active')) renderCompare();
    if ($('#tab-help').classList.contains('active')) renderHelp();
    if ($('#tab-db').classList.contains('active')) renderDB();
    if ($('#tab-craft').classList.contains('active')) window.PS2Acquisition.render();
    if ($('#tab-loot').classList.contains('active')) window.PS2Loot.render();
    if ($('#tab-patch').classList.contains('active')) renderPatch();
  }
  renderAll();
  const h0 = (location.hash || '').slice(1); if (h0 && $('#tab-' + h0)) showTab(h0);
  window.PS2App = { S, runOpt, runBest, showTab, renderAll, get lastBest() { return lastBest; } };
})();
