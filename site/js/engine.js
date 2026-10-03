/* PS2 CALC: formula engine. Reads window.PS2_DATA + window.PS2_CONFIG. No DOM access here. */
(function initEngine() {
  'use strict';
  const D = window.PS2_DATA, C = window.PS2_CONFIG;
  const byName = (arr) => Object.fromEntries(arr.map((x) => [x.name, x]));
  const IDX = {
    weapons: byName(D.weapons.data), equipment: byName(D.equipment.data), clans: byName(D.clans.data),
    titles: byName(D.titles.data), breathings: byName(D.breathings.data), bdas: byName(D.bdas.data),
    styles: byName(D.fightingstyles.data), skilltree: byName(D.skilltree.data),
    effectsByOwner: D.effects.data.reduce((m, e) => ((m[e.owner] = m[e.owner] || []).push(e), m), {}),
  };
  /* old names kept as `aliases` in the data (renamed items / merged arts) -> current name */
  const ALIAS = {};
  [['weapons', D.weapons.data], ['equipment', D.equipment.data], ['titles', D.titles.data], ['arts', D.breathings.data.concat(D.bdas.data)]].forEach(([k, arr]) => {
    ALIAS[k] = {}; arr.forEach((x) => (x.aliases || []).forEach((a) => { ALIAS[k][a] = x.name; }));
  });
  const resolveName = (kind, n) => (n && ALIAS[kind] && ALIAS[kind][n]) || n;
  const CONF_RANK = { high: 3, medium: 2, low: 1, unverified: 0 };
  const minConf = (list) => list.reduce((a, c) => (CONF_RANK[c] < CONF_RANK[a] ? c : a), 'high');
  const srcOf = (keys) => (keys || []).map((k) => ({ key: k, ...(D.sources[k] || { url: null, sourceType: '?', date: '?' }) }));
  const entrySources = (e) => (e && e.sources ? e.sources.map((s) => ({ key: s.key, url: s.url, sourceType: s.sourceType, date: s.date })) : []);
  const num = (v, d) => (v === null || v === undefined || Number.isNaN(v) ? d : v);

  /* ---------------- rules ---------------- */
  function ruleValue(id, overrides) {
    const r = D.rules.configurableRules[id];
    if (overrides && id in overrides) return overrides[id];
    return r ? r.default : false;
  }
  /* slot = descriptive sub-type (face/head/neck/...); category = display group; game rule = 5 shared Stats slots, no per-type cap */
  function slotOf(item) { return item ? item.slot : null; }
  function catOf(item) { if (!item) return null; return item.category || (item.slot === 'body' ? 'uniform' : item.slot === 'haori' ? 'haori' : 'accessory'); }
  function catMax(cat) { const c = (D.rules.equipCategories || {})[cat]; return c && c.max ? c.max : Infinity; }
  function catLabel(cat) { const c = (D.rules.equipCategories || {})[cat]; return c ? c.label : cat; }
  function itemLabel(item) { if (!item) return ''; const c = catOf(item); return c === 'accessory' ? `${catLabel(c)}: ${(D.rules.slotLabels || {})[item.slot] || item.slot}` : catLabel(c); }
  function equipList(b) { const e = b && b.equipment; if (!e) return []; return (Array.isArray(e) ? e : Object.values(e)).filter(Boolean); }
  function factionAllowed(entryFaction, faction, ruleOv) {
    if (!entryFaction || entryFaction === 'both' || entryFaction === null) return true;
    if (entryFaction.endsWith('?')) return ruleValue('applyUnverifiedFactionRestrictions', ruleOv) ? entryFaction.replace('?', '') === faction : true;
    return entryFaction === faction;
  }
  /* Weapon -> Breathing / BDA (game: Powers/Resolve.LaneCarries + Skills_Provider). A weapon carries one lane
     (Breathing = "All" for katanas, "Stone Breathing" for Axe & Mace, DemonArt = "All,exceptBlood Manipulation" for
     claws/gauntlets, "Blood Manipulation" for sickles, "Cryokinesis" for war fans) or none (tanto, spear, scythe,
     wagasa, shotgun, cutlass: no art at all). An art with a weaponCategory (Stone: AxeAndMace) also needs it.
     artLane undefined = not documented: no restriction (synthetic test weapons). */
  /* Nightfall bleed (series weapons from Tier 3): % of the target's max HP per tick and per stack, up to 3 stacks.
     Damage over time on top of the M1, not part of the per-hit ranking. hp: the target's max HP (bosses: 3,000). */
  function bleedOf(b, hp) {
    const w = b && IDX.weapons[b.weapon]; if (!w) return null;
    const p = (w.passives || []).find((x) => /bleed/i.test(x.name || '') && x.numeric);
    if (!p || (+b.tier || 1) < (p.minTier || 3)) return null;
    const H = +hp > 0 ? +hp : 3000, stacks = p.maxStacks || 3, tick = p.tickSec || 1;
    return { pct: p.numeric, stacks, tickSec: tick, hp: H, perTick: p.numeric * H, dps: stacks * p.numeric * H / tick };
  }
  /* DPS over a whole kill: direct M1 DPS D, bleed B (both per second); Nightfall Hunt (T3 top + bottom) adds its
     damagePct to the hits while the target is under its HP threshold (the last 30 % of its HP). Time to kill =
     share above / (D + B) + share below / (D × (1 + pct) + B). */
  function huntPct() { const e = (D.effects.data || []).find((x) => x.id === 'nf_hunt'); return e ? (e.stats.damagePct || 0) / 100 : 0; }
  function fightDpsRaw(dps, bleed, hunt) {
    if (!(dps > 0)) return dps;
    const B = bleed || 0, p = hunt ? huntPct() : 0, low = 0.3;
    return p ? 1 / ((1 - low) / (dps + B) + low / (dps * (1 + p) + B)) : dps + B;
  }
  function fightDps(b, dps, hp) { const bl = bleedOf(b, hp); return fightDpsRaw(dps, bl ? bl.dps : 0, nightfallHuntOn(b)); }
  function laneCarries(lane, art) {
    const l = String(lane).toLowerCase(), a = String(art).toLowerCase();
    if (l.includes('all')) return !l.includes('except' + a);
    return l.includes(a) && !l.includes('except' + a);
  }
  function artsOf(faction) { return faction === 'slayer' ? D.breathings.data : D.bdas.data; }
  function weaponArts(w, faction) {
    if (!w || w.artLane === undefined) return artsOf(faction).map((a) => a.name);
    const lane = w.artLane; if (!lane || lane.kind !== (faction === 'slayer' ? 'breathing' : 'demonArt')) return [];
    return artsOf(faction).filter((a) => laneCarries(lane.value, a.gameName || a.name) && (!a.weaponCategory || a.weaponCategory === w.gameCategory)).map((a) => a.name);
  }
  function weaponArtOk(w, faction, art) {
    if (!w || w.artLane === undefined || faction === 'hybrid') return true;
    const ok = weaponArts(w, faction); return art ? ok.includes(art) : ok.length > 0;
  }
  function equippable() {
    return D.equipment.data.filter((e) => !e.unobtainable && D.rules.slotTypes.includes(e.slot) && !D.rules.nonEquippableEquipment.includes(e.name));
  }
  function slotTypes() { return D.rules.slotTypes.slice(); }
  /* Series (Nightfall / Firstlight) items: Stats x TierMultiplier (PlayerStatResolver/Solvers/Accessory). Refine only scales RefineStats (no damage stat). */
  function seriesTierMult(t) { const m = D.rules.seriesTierMultipliers || [1, 1.15, 1.3]; const i = Math.max(1, Math.min(m.length, Math.round(+t || 1))) - 1; return m[i]; }
  function itemStatsAt(it, tier) {
    const tm = it && it.series ? seriesTierMult(tier) : 1;
    const ad = (it.additionalDamage || 0) * tm, f = it.additionalDamageFactor || 1;
    return { ad, adf: 1 + (f - 1) * tm, asf: it.attackSpeedFactor ? 1 + (it.attackSpeedFactor - 1) * tm : null, tm };
  }
  /* list of {name, tier, i} for the filled equipment slots */
  function equipSlots(b) {
    const e = Array.isArray(b && b.equipment) ? b.equipment : equipList(b); const t = (b && b.equipTier) || [];
    const seen = new Set();
    return e.map((n, i) => ({ n: resolveName('equipment', n), i, tier: Math.max(1, Math.min(3, Math.round(+t[i] || 1))) }))
      .filter(x => { if (!x.n || seen.has(x.n)) return false; seen.add(x.n); return true; });
  }
  function nightfallHuntOn(b) {
    const s = equipSlots(b); const ok = (n) => s.some((x) => x.n === n && x.tier >= 3);
    return ok('Nightfall Top') && ok('Nightfall Bottom');
  }

  /* ---------------- build model ---------------- */
  function defaultBuild(faction) {
    return {
      name: 'Build', level: C.maxLevel, mastery: C.baseM1.maxMastery, baseOverride: null, faction: faction || 'slayer', clan: null, weapon: null,
      tier: 1, refine: 0, weaponOverride: { ad: null, adf: null }, equipment: [], titles: [null, null, null], unlockedTitles: [],
      skillNodes: [], demonProgress: 0, art: null, style: null,
      toggles: { temp: false, mode: false, mark: false }, conds: {}, inputs: { ciMode: 'auto', ciStored: 0, recentSkillDamage: 0, stacks: {} }, target: 'npc',
      uptime: C.defaultTempUptime, rules: {},
    };
  }
  function normalizeBuild(b) {
    const d = defaultBuild(b.faction);
    const out = Object.assign(d, JSON.parse(JSON.stringify(b)));
    if (!Array.isArray(out.equipment)) { // legacy map {type: name} (+ equipOrder) -> list of names
      const names = Object.values(out.equipment || {}).filter(Boolean);
      const order = (out.equipOrder || []).filter((n) => n && names.includes(n));
      out.equipment = order.concat(names.filter((n) => !order.includes(n)));
    }
    delete out.equipOrder;
    out.equipment = out.equipment.map((n) => resolveName('equipment', n)).map((n) => (n && IDX.equipment[n] ? n : null));
    const usedEquipment = new Set(), removed = [];
    out.equipment = out.equipment.map(n => {
      if (!n) return null;
      if (usedEquipment.has(n)) { removed.push(n); return null; }
      usedEquipment.add(n); return n;
    });
    if (removed.length) out.equipmentDuplicatesRemoved = [...new Set(removed)];
    const et = Array.isArray(out.equipTier) ? out.equipTier : [];
    out.equipTier = out.equipment.map((n, i) => n ? Math.max(1, Math.min(3, Math.round(+et[i] || 1))) : 1);
    out.weapon = resolveName('weapons', out.weapon);
    out.art = resolveName('arts', out.art);
    out.titles = (out.titles || []).map((n) => resolveName('titles', n));
    out.unlockedTitles = (out.unlockedTitles || []).map((n) => resolveName('titles', n));
    if (out.rules) delete out.rules.redOniSeparateSlot;
    out.titles = (out.titles || []).concat([null, null, null]).slice(0, C.maxTitles || D.rules.maxTitles || 3);
    return out;
  }
  function validateBuild(b) {
    const errs = [], warns = [];
    if (b.baseOverride !== null && b.baseOverride !== '' && b.baseOverride !== undefined && (!Number.isFinite(+b.baseOverride) || +b.baseOverride < 0)) errs.push('Invalid manual base: a number ≥ 0 is required.');
    const eq = equipList(b);
    const canonicalEquipment = eq.map(n => resolveName('equipment', n));
    if (new Set(canonicalEquipment).size !== canonicalEquipment.length) errs.push('An item can only be worn once, even at different tiers.');
    if (b.equipmentDuplicatesRemoved && b.equipmentDuplicatesRemoved.length) warns.push(`Old build fixed: duplicate copies removed (${b.equipmentDuplicatesRemoved.join(', ')}). The first slot of each item was kept.`);
    if (eq.length > D.rules.maxEquipSlots) errs.push(`Too many items: ${eq.length} (max ${D.rules.maxEquipSlots}).`);
    const byCat = {};
    canonicalEquipment.forEach((n) => {
      const it = IDX.equipment[n]; if (!it) { errs.push(`Item not found: ${n}`); return; }
      const c = catOf(it); (byCat[c] = byCat[c] || []).push(n);
      if (!factionAllowed(it.faction, b.faction, b.rules)) errs.push(`${n} is not allowed for the ${b.faction} faction.`);
    });
    Object.entries(byCat).forEach(([c, ns]) => { if (ns.length > catMax(c)) errs.push(`Maximum ${catMax(c)} ${catLabel(c).toLowerCase()}: ${ns.join(', ')}.`); });
    (D.rules.mutualExclusions || []).forEach(([a, c]) => { if (canonicalEquipment.includes(a) && canonicalEquipment.includes(c)) errs.push(`${a} et ${c} sont mutuellement exclusifs.`); });
    if (b.weapon) { const w = IDX.weapons[b.weapon]; if (w && !factionAllowed(w.faction, b.faction, b.rules)) errs.push(`${b.weapon} is a ${w.faction} weapon.`); if (w && !w.faction) warns.push(`${b.weapon}: usable by both factions.`); }
    const t = b.titles.filter(Boolean); if (new Set(t).size !== t.length) errs.push('The same title is equipped twice.');
    if (b.art) { const art = IDX.breathings[b.art] || IDX.bdas[b.art]; if (art && !factionAllowed(art.faction, b.faction)) errs.push(`${b.art} is not available for this faction.`); }
    return { errs, warns };
  }

  /* ---------------- weapon stats: tier/refine model (research 2026-09-28) ----------------
     AD = AD(T1 R0) x tier multiplier x refine multiplier (in-game Refiner panel); ADF bonus x tier multiplier; refine R1-R9 leaves ADF unchanged (observed).
     R10 ADF effect not verified (metadata in weapons.json only). A tooltip value typed by the user always wins. */
  function weaponStats(b) { return weaponStatsAt(IDX.weapons[b.weapon], b.tier, b.refine, b.weaponOverride); }
  function weaponStatsAt(w, tier, refine, override) {
    if (!w) return null;
    const ov = override || {};
    const T = Math.min(+tier || 1, w.maxTier || 1), R = Math.max(0, Math.min(+refine || 0, w.maxRefine ?? 10));
    const baseAdf = num(w.additionalDamageFactor, 1);
    const res = { ad: w.additionalDamage, adf: baseAdf, confidence: w.confidence, sources: entrySources(w), mode: 'base', notes: [], flags: [] };
    const rm = w.refineScaling && w.refineScaling.multipliers;
    const tmTab = w.tierScaling && w.tierScaling.multipliers;
    const obs = ((w.refineScaling && w.refineScaling.observed) || []).find((o) => o.weapon === w.name && o.tier === T && o.refine === R);
    if (T === 1 && R === 0) res.mode = 'base';
    else if (rm && w.additionalDamage !== null && w.additionalDamage !== undefined) {
      let tm = 1;
      if (T > 1) { if (tmTab && tmTab[T] !== undefined) tm = tmTab[T]; else res.notes.push(`This weapon has no tier ${T} (only the Nightfall/Firstlight series do): tier ignored.`); }
      res.ad = w.additionalDamage * tm * rm[R];
      res.tierMult = tm; res.refineMult = rm[R];
      const rs = w.refineStats || ['Additional Damage'], adfIdx = rs.indexOf('Additional Damage Factor');
      const adfRefine = adfIdx === 0 ? rm[R] : adfIdx > 0 ? 1 + (rm[R] - 1) * (w.secondaryRefineShare ?? 0.5) : 1;
      res.adf = 1 + (baseAdf - 1) * tm * adfRefine;
      res.mode = 'model';
      res.notes.push(`AD ${fmtN(w.additionalDamage)} × tier ${fmtN(tm)} × refine ${fmtN(rm[R])}; ADF bonus × tier.`);
      if (obs) res.notes.push(`Seen in game: +${fmtN(obs.additionalDamage)} AD${obs.additionalDamageFactor ? ', ' + fmtN(obs.additionalDamageFactor) + 'x' : ''}.`);
    }
    else if (obs) { res.ad = obs.additionalDamage; res.adf = obs.additionalDamageFactor; res.mode = 'observed'; res.notes.push(`Value seen in game (T${obs.tier} R${obs.refine}).`); res.sources = res.sources.concat(srcOf([String(obs.source).split(' ')[0]].filter((k) => D.sources[k]))); }
    else { res.mode = 'baseFallback'; res.confidence = 'unverified'; res.notes.push(`No tier/refine for this weapon: base values used. You can enter the tooltip AD/ADF.`); }
    if (ov.ad !== null && ov.ad !== undefined && ov.ad !== '') { res.ad = +ov.ad; res.mode = 'override'; res.confidence = 'high'; res.flags = []; res.notes = ['AD saisi manuellement (infobulle).']; }
    if (ov.adf !== null && ov.adf !== undefined && ov.adf !== '') { res.adf = +ov.adf; res.mode = 'override'; res.flags = []; res.notes.push('ADF saisi manuellement (infobulle).'); }
    res.tier = T; res.refine = R;
    return res;
  }
  function fmtN(x) { return String(Math.round(x * 10000) / 10000); }

  /* ---------------- components ---------------- */
  // EffectServer.release writes storage * 0.1 to the Additional Damage stat.
  function combatIntuition(b, e) {
    const i = b.inputs || {}, st = e.stats;
    const nonnegative = (v) => Number.isFinite(+v) ? Math.max(0, +v) : 0;
    const source = i.ciSourceTarget || b.target;
    const share = st.ciSource === 'dealt' ? (source === 'player' ? st.ciSharePvp ?? 1 : st.ciShareNpc ?? 1) : 1;
    const input = nonnegative(i.ciStored);
    const storage = i.ciInputStage === 'stored' ? input :
      st.ciSource === 'dealt' && source === 'mixed' ?
        nonnegative(i.ciDealtNpc) * (st.ciShareNpc ?? 1) + nonnegative(i.ciDealtPlayer) * (st.ciSharePvp ?? 1) : input * share;
    const mode = i.ciMode === 'auto' ? 'auto' : 'manual';
    return { storage: mode === 'auto' ? null : storage, additionalDamage: mode === 'auto' ? null : storage * st.ciConversion, share, mode,
      inputStage: i.ciInputStage === 'stored' ? 'stored' : 'raw', phase: i.ciPhase || 'release',
      storeWindowSec: e.storeWindowSec, durationSec: e.durationSec, cooldownSec: e.cooldownSec, cap: null };
  }
  function activeEffects(b) {
    const out = [];
    const owners = [b.clan].filter(Boolean);
    owners.push('Nightfall armor set');
    owners.forEach((o) => (IDX.effectsByOwner[o] || []).forEach((e) => {
      if (e.autoRequires === 'nightfallHuntT3' && !nightfallHuntOn(b)) return;
      const weaponType = b.weapon && IDX.weapons[b.weapon] && IDX.weapons[b.weapon].type;
      if (e.weaponTypes && !e.weaponTypes.includes(weaponType)) return;
      if (e.conds.includes('fists') && b.weapon && weaponType !== 'fist') return;
      const elapsed = Math.max(0, +((b.inputs.effectElapsed || {})[e.id]) || 0);
      const expired = e.durationSec !== undefined && elapsed >= e.durationSec;
      const ciInactive = e.stats.ciConversion && (b.inputs.ciPhase || 'release') !== 'release';
      const wrongDraw = e.id === 'uzui_vdm' && (b.inputs.vitalDraw || 'Muscle') !== 'Muscle';
      const reqOk = e.requires.every((r) => b.toggles[r]);
      const condOk = e.conds.every((c) => c === 'hpAbove90' ? b.conds[c] && !b.conds.hpBelow60 && !b.conds.hpBelow30 : c === 'hpBelow60' ? b.conds[c] || b.conds.hpBelow30 : b.conds[c]);
      out.push({ e, active: reqOk && condOk && !expired && !ciInactive && !wrongDraw,
        expired, temporary: e.requires.length > 0 || e.conds.length > 0 });
    }));
    return out;
  }

  // Base M1 : 3 + 0,027 × maîtrise de l'arme tenue (config.baseM1).
  function baseAt(mastery) {
    const m = C.baseM1, lvl = +mastery;
    if (!Number.isInteger(lvl) || lvl < 0 || lvl > m.maxMastery) return null;
    return m.value + m.perMastery * lvl;
  }
  function baseForWeaponObj(w, mastery) {
    const value = w ? baseAt(mastery) : null;
    return value === null ? null : { value, weapon: w.name, type: w.type };
  }
  function collect(b) {
    const comps = []; const flags = [];
    const add = (c) => comps.push(Object.assign({ temporary: false, flags: [], sources: [], confidence: 'medium' }, c));
    // base
    const lvl = +b.level, mst = +b.mastery;
    const manualBase = b.baseOverride !== null && b.baseOverride !== '' && b.baseOverride !== undefined;
    if (manualBase && (!Number.isFinite(+b.baseOverride) || +b.baseOverride < 0)) add({ id: 'base', label: 'Invalid manual base', group: 'base', value: null, confidence: 'unverified', flags: ['baseUnknown'] });
    else if (manualBase) add({ id: 'base', label: `M1 base (manual scenario)`, group: 'base', value: +b.baseOverride, confidence: 'unverified', flags: ['baseScenario'], sources: [] });
    else if (baseAt(mst) !== null) add({ id: 'base', label: `M1 base, mastery ${mst}`, group: 'base', value: baseAt(mst), confidence: 'high', note: 'Base = 3 + 0.027 × mastery', sources: [] });
    else { add({ id: 'base', label: `M1 base, mastery ${b.mastery}: UNKNOWN`, group: 'base', value: null, confidence: 'unverified', flags: ['baseUnknown'] }); flags.push('baseUnknown'); }
    // weapon
    const ws = weaponStats(b);
    if (ws) {
      add({ id: 'w_ad', label: `${b.weapon} (T${ws.tier} R${ws.refine}): AD`, group: 'flat', value: num(ws.ad, 0), confidence: ws.confidence, sources: ws.sources, note: ws.notes.join(' '), flags: (ws.mode === 'baseFallback' ? ['curveUnknown'] : []).concat(ws.flags || []) });
      add({ id: 'w_adf', label: `${b.weapon}: ADF`, group: 'factor', value: ws.adf, confidence: ws.confidence, sources: ws.sources, note: ws.notes.join(' ') });
      if (ws.mode === 'baseFallback') flags.push('curveUnknown');
      (ws.flags || []).forEach((f) => flags.push(f));
    }
    // M1 timing (per weapon combat preset; fists when no weapon)
    { const w = b.weapon && IDX.weapons[b.weapon]; const t = timingOf(w);
      add({ id: 'w_cad', label: `M1 cadence (${t.preset}): ${t.hits} hits every ${fmtN(t.cycleSec)} s (${fmtN(t.betweenHits)} s between hits, ${fmtN(t.afterFinisher)} s after the 5th)`, group: 'cycle', value: t.cycleSec, span: t.chainSpanSec, confidence: 'high' }); }
    // equipment
    equipSlots(b).forEach(({ n, i, tier }) => {
      const it = IDX.equipment[n]; if (!it) return;
      const st = itemStatsAt(it, tier); const tl = it.series ? ` T${tier}` : '';
      if (it.additionalDamage) add({ id: 'eq_ad_' + i + '_' + n, label: `${n}${tl} [${itemLabel(it)}]: AD`, group: 'flat', value: st.ad, confidence: it.confidence, sources: entrySources(it), note: it.notes });
      if (it.additionalDamageFactor && it.additionalDamageFactor !== 1) add({ id: 'eq_adf_' + i + '_' + n, label: `${n}${tl} [${itemLabel(it)}]: ADF`, group: 'factor', value: st.adf, confidence: it.confidence, sources: entrySources(it), note: it.notes });
      if (it.attackSpeedFactor) add({ id: 'eq_asf_' + i + '_' + n, label: `${n}: Attack Speed`, group: 'asf', value: st.asf, confidence: it.confidence, sources: entrySources(it) });
    });
    // titles
    const eqT = b.titles.filter(Boolean);
    eqT.forEach((tn) => {
      const t = IDX.titles[tn]; if (!t) return; const bu = t.buffWhileEquipped || {};
      if (bu.additionalDamage) add({ id: 't_ad_' + tn, label: `Title ${tn} (equipped buff): AD`, group: 'flat', value: bu.additionalDamage, confidence: t.confidence, sources: entrySources(t) });
      if (bu.additionalDamageFactor) add({ id: 't_adf_' + tn, label: `Title ${tn}: ADF`, group: 'factor', value: bu.additionalDamageFactor, confidence: t.confidence, sources: entrySources(t) });
      if (bu.attackSpeedFactor) add({ id: 't_asf_' + tn, label: `Title ${tn}: Attack Speed Factor`, group: 'asf', value: bu.attackSpeedFactor, confidence: t.confidence, sources: entrySources(t) });
      // Titles.GetStatBonus matches the stat name, not the title's mastery name.
      const artOk = !t.appliesToArt || t.appliesToArt === b.art;
      if (bu.breathingDamageFactor && artOk) add({ id: 't_bdf_' + tn, label: `Title ${tn}: Breathing Damage Factor`, group: 'elemBreathing', value: bu.breathingDamageFactor, confidence: t.confidence, sources: entrySources(t) });
      if (bu.evilArtDamageFactor && artOk) add({ id: 't_eadf_' + tn, label: `Title ${tn}: Evil Art Damage Factor`, group: 'elemEvil', value: bu.evilArtDamageFactor, confidence: t.confidence, sources: entrySources(t) });
    });
    const passiveTitles = new Set(C.titlePassiveMode === 'none' ? [] : C.titlePassiveMode === 'equippedOnly' ? eqT : eqT.concat(b.unlockedTitles || []));
    passiveTitles.forEach((tn) => {
      const t = IDX.titles[tn]; if (!t) return; const p = t.passiveAlwaysOn || {};
      if (p.additionalDamage) add({ id: 't_pad_' + tn, label: `Title ${tn} (passive): AD`, group: 'flat', value: p.additionalDamage, confidence: 'medium', sources: entrySources(t), flags: ['titlePassiveScope'] });
      [['additionalDamageFactor', 'factor'], ['attackSpeedFactor', 'asf'], ['breathingDamageFactor', 'elemBreathing'], ['evilArtDamageFactor', 'elemEvil']].forEach(([key, group]) => {
        if (p[key]) add({ id: 't_passive_' + key + '_' + tn, label: `Title ${tn} (collection): ${key}`, group, value: p[key], confidence: t.confidence, sources: entrySources(t) });
      });
    });
    // skill tree
    (b.skillNodes || []).forEach((sn) => { const s = IDX.skilltree[sn]; if (s && s.additionalDamage) add({ id: 'st_' + sn, label: `Skill tree: ${sn}`, group: 'flat', value: s.additionalDamage, confidence: s.confidence, sources: entrySources(s) }); });
    // progression
    if (b.faction === 'demon' && +b.demonProgress >= 4) {
      const p = D.progression.data.demonProgress;
      add({ id: 'dp_ad', label: 'Demon Progress Lv. 4 (Max): AD', group: 'flat', value: p.atMax.additionalDamage, confidence: p.confidence, sources: entrySources(p) });
      add({ id: 'dp_ea', label: 'Demon Progress Lv. 4: +0.04 Evil Art Damage Factor', group: 'elemEvilAdd', value: p.atMax.evilArtDamageFactorAdd, confidence: p.confidence, sources: entrySources(p) });
    } else if (b.faction === 'demon' && +b.demonProgress > 0) { add({ id: 'dp_0', label: `Demon Progress Lv. ${b.demonProgress}: no damage (HP / regen only)`, group: 'flat', value: 0, confidence: 'unverified', flags: ['unknown'] }); }
    // clan
    const clan = IDX.clans[b.clan];
    if (clan) {
      add({ id: 'clan', label: `Clan ${clan.name}: ADF ${clan.additionalDamageFactorPct ?? 0} %`, group: 'clan', value: num(clan.additionalDamageFactorPct, 0) / 100, confidence: clan.confidence, sources: entrySources(clan) });
      if (clan.additionalDamage) add({ id: 'clan_ad', label: `Clan ${clan.name}: AD`, group: 'flat', value: clan.additionalDamage, confidence: clan.confidence, sources: entrySources(clan) });
    }
    activeEffects(b).forEach(({ e, active, temporary }) => {
      if (!active) return;
      const st = e.stats, base = { temporary, confidence: e.confidence, sources: srcOf(e.sourceKeys), note: e.note, flags: [] };
      if (e.requires.includes('mode')) base.flags.push('mode'); if (e.requires.includes('mark')) base.flags.push('mark'); if (e.conds.length) base.flags.push('condition');
      if (st.adfPct) add(Object.assign({}, base, { id: 'fx_adf_' + e.id, label: `${e.name}`, group: C.clanTempAdfMode === 'addToClanPct' ? 'clan' : 'factor', value: C.clanTempAdfMode === 'addToClanPct' ? st.adfPct / 100 : 1 + st.adfPct / 100 }));
      if (st.ad) add(Object.assign({}, base, { id: 'fx_ad_' + e.id, label: `${e.name}: AD`, group: 'flat', value: st.ad }));
      if (st.asf) add(Object.assign({}, base, { id: 'fx_asf_' + e.id, label: `${e.name}`, group: 'asf', value: st.asf }));
      if (st.markPct) add(Object.assign({}, base, { id: 'fx_mark_' + e.id, label: `${e.name}`, group: 'mult', value: 1 + st.markPct / 100 }));
      if (st.damagePct) add(Object.assign({}, base, { id: 'fx_dmg_' + e.id, label: `${e.name}`, group: 'mult', value: 1 + st.damagePct / 100 }));
      if (st.elementPct) Object.entries(st.elementPct).forEach(([art, pct]) => add(Object.assign({}, base, { id: 'fx_el_' + e.id + art, label: `${e.name} (${art})`, group: 'elemArt', art, value: 1 + pct / 100 })));
      if (st.elementPctPerStack) {
        const n = Math.max(0, Math.min(st.maxStacks ?? Infinity, +((b.inputs.stacks || {})[st.stackInput] || 0)));
        Object.entries(st.elementPctPerStack).forEach(([art, pct]) => add(Object.assign({}, base, { id: 'fx_els_' + e.id + art, label: `${e.name} × ${n} stack(s) (${art})`, group: 'elemArt', art, value: 1 + (pct * n) / 100 })));
      }
      if (st.ciConversion) {
        const ci = combatIntuition(b, e);
        if (ci.mode === 'auto' && st.ciSource === 'dealt') {
          add(Object.assign({}, base, { id: 'fx_ci_' + e.id, label: `${e.name} — M1 estimate over ${e.storeWindowSec} s`,
            group: 'ci-auto', value: 0, confidence: 'medium',
            ciAuto: { share: b.target === 'player' ? st.ciSharePvp : st.ciShareNpc, windowSec: e.storeWindowSec, conversion: st.ciConversion },
            flags: base.flags.concat(['ciAutoScenario', 'ciCapUnknown', 'ciSkillApplicationUnknown']) }));
        } else if (ci.mode === 'auto') {
          add(Object.assign({}, base, { id: 'fx_ci_' + e.id, label: `${e.name} — damage taken cannot be estimated from the build`,
            group: 'flat', value: 0, confidence: 'unverified', flags: base.flags.concat(['ciIncomingUnknown']) }));
        } else add(Object.assign({}, base, { id: 'fx_ci_' + e.id,
          label: `${e.name}: storage ${ci.storage} × ${st.ciConversion} = +${ci.additionalDamage} AD`,
          group: 'flat', value: ci.additionalDamage, flags: base.flags.concat(['ciCapUnknown', 'ciSkillApplicationUnknown']) }));
      }
      if (st.m1FlatPer100Skill) {
        const sd = +b.inputs.recentSkillDamage || 0;
        add(Object.assign({}, base, { id: 'fx_ra_' + e.id, label: `${e.name}: ${sd} skill damage`, group: C.temporaryFlatMode === 'asAD' ? 'flat' : 'post', value: Math.floor(sd / 100) * st.m1FlatPer100Skill }));
      }
    });
    comps.forEach((c) => { if (c.temporary && !c.flags.includes('temporary')) c.flags.push('temporary'); });
    return { comps, flags };
  }

  function timingOf(w) { return (w && w.m1Timing) || C.defaultM1Timing; }
  function aggregate(comps, skip) {
    const a = { base: 0, baseKnown: true, A: 0, Fprod: 1, Fsum: 0, clan: 0, post: 0, mult: 1, asf: 1, asfBonus: 0, cycle: C.defaultM1Timing.cycleSec, span: C.defaultM1Timing.chainSpanSec, elemBreathing: 1, elemEvil: 1, elemEvilAdd: 0, elemArt: {} };
    comps.forEach((c) => {
      if (skip && skip(c)) return;
      switch (c.group) {
        case 'base': if (c.value === null) a.baseKnown = false; else a.base += c.value; break;
        case 'flat': a.A += c.value; break;
        case 'ci-auto': a.ciAuto = c.ciAuto; break;
        case 'factor': a.Fprod *= c.value; a.Fsum += c.value - 1; break;
        case 'clan': a.clan += c.value; break;
        case 'post': a.post += c.value; break;
        case 'mult': a.mult *= c.value; break;
        case 'asf': a.asfBonus += c.value - 1; break;
        case 'cycle': a.cycle = c.value; a.span = c.span; break;
        case 'elemBreathing': a.elemBreathing += c.value - 1; break;
        case 'elemEvil': a.elemEvil += c.value - 1; break;
        case 'elemEvilAdd': a.elemEvilAdd += c.value; break;
        case 'elemArt': a.elemArt[c.art] = (a.elemArt[c.art] || 1) * c.value; break;
      }
    });
    a.asf = Math.max(1 + a.asfBonus, 0.25); // game: attackSpeedMult = max(1 + sum(Attack Speed Factor), 0.25)
    return a;
  }

  /* core formulas (single source of truth; optimizer uses this too) */
  function core(fid, base, A, Fprod, Fsum, clan) {
    switch (fid) {
      case 'F1': return base + A * Fprod * (1 + clan);
      case 'F2': return base + A * (1 + Fsum + clan);
      case 'F3': return (base + A) * Fprod * (1 + clan);
      case 'F4': return (base + A) * (1 + Fsum + clan);
      case 'F5': return base + A * (Fprod + clan);
      case 'F6': return base + A;
      default: throw new Error('Formule invalide ' + fid);
    }
  }
  function roundDmg(v) { return C.damageRounding === 'round' ? Math.round(v) : C.damageRounding === 'floor' ? Math.floor(v) : v; }
  // GetStat rounds the completed sum, never individual item contributions.
  const statRound = v => Math.sign(v) * Math.round(Math.abs(v) * 1000) / 1000;
  function resolvedStats(a) { return { additionalDamage: statRound(a.A), additionalDamageFactor: 1 + statRound(a.Fsum + a.clan), attackSpeedFactor: Math.max(1 + statRound(a.asfBonus), .25), breathingDamageFactor: 1 + statRound(a.elemBreathing - 1), evilArtDamageFactor: 1 + statRound(a.elemEvil - 1 + a.elemEvilAdd) }; }
  function m1Core(a, fid, base, adMult) { const s = resolvedStats(a); return core(fid, base, s.additionalDamage * adMult, a.Fprod, s.additionalDamageFactor - 1 - a.clan, a.clan); }
  function withAutoCI(a, fid) {
    if (!a.ciAuto || !a.baseKnown) return a;
    // First activation benchmark: same full build WITHOUT CI. No feedback loop.
    const raw = { ...a, A: a.A - (a.ciAutoApplied || 0), ciAuto: null, ciAutoApplied: 0 };
    const m1 = m1From(raw, fid), finisher = finFrom(raw, fid);
    const dps = avgHit(m1, finisher) * hitsPerSec(raw);
    const damage = dps * a.ciAuto.windowSec;
    const storage = damage * a.ciAuto.share, additionalDamage = storage * a.ciAuto.conversion;
    return { ...a, A: raw.A + additionalDamage, ciAutoApplied: additionalDamage,
      ciEstimate: { mode: 'auto', storage, additionalDamage, damageBeforeStorage: damage,
        baselineM1: m1, baselineFinisher: finisher, baselineDps: dps, windowSec: a.ciAuto.windowSec,
        share: a.ciAuto.share, conversion: a.ciAuto.conversion,
        assumptions: ['Sustained M1 DPS without CI or skills', 'A target without damage reduction that survives 12 s', 'Build conditions kept during storage and release', 'No heals, dodges, blocks or interruptions modelled', 'No earlier CI bonus'], cap: null } };
  }
  function m1From(a, fid) { if (!a.baseKnown) return null; a = withAutoCI(a, fid); return roundDmg((m1Core(a, fid, a.base, 1) + a.post) * a.mult); }
  function finFrom(a, fid) { if (!a.baseKnown) return null; a = withAutoCI(a, fid); const f = C.m1Finisher || { baseMult: 1, adMult: 1 }; return roundDmg((m1Core(a, fid, a.base * f.baseMult, f.adMult) + a.post) * a.mult); }
  // Affine expression in the unresolved base, NOT a total evaluated at zero.
  // Auto-CI would itself depend on that base, so cannot produce such a bound.
  function m1Terms(a, fid, finisher = false) {
    if (a.ciAuto && !a.baseKnown) return null;
    a = withAutoCI(a, fid);
    const f = finisher ? (C.m1Finisher || { baseMult: 1, adMult: 1 }) : { baseMult: 1, adMult: 1 };
    const zero = m1Core(a, fid, 0, f.adMult);
    const coefficient = (m1Core(a, fid, f.baseMult, f.adMult) - zero) * a.mult;
    return { baseKnown: a.baseKnown, base: a.baseKnown ? a.base : null,
      coefficient, offset: (zero + a.post) * a.mult, rounding: C.damageRounding,
      numeric: finisher ? finFrom(a, fid) : m1From(a, fid) };
  }
  function hitStages(a, fid) {
    if (!a.baseKnown) return null;
    a = withAutoCI(a, fid);
    const f = C.m1Finisher || { baseMult: 1, adMult: 1 }, stats = resolvedStats(a);
    return { base: a.base, ad: stats.additionalDamage, adf: stats.additionalDamageFactor,
      temporaryFlat: a.post, combatMultiplier: a.mult,
      normalBeforeCombatEffects: m1Core(a, fid, a.base, 1) + a.post,
      finisherBeforeCombatEffects: m1Core(a, fid, a.base * f.baseMult, f.adMult) + a.post,
      normalFinal: m1From(a, fid), finisherFinal: finFrom(a, fid) };
  }
  function avgHit(m1, fin) { const n = C.m1ChainHits; return m1 === null || fin === null ? null : ((n - 1) * m1 + fin) / n; }
  function hitsPerSec(a) { return C.m1ChainHits / (a.cycle / resolvedStats(a).attackSpeedFactor); }

  /* ---------------- skills & rotation ---------------- */
  let MOVE_OVERRIDES = {};
  function setMoveOverrides(o) { MOVE_OVERRIDES = o || {}; }
  function movesFor(art) {
    if (!art) return [];
    const base = (D.moves.data[art] || []).map((m) => Object.assign({}, m));
    const ov = MOVE_OVERRIDES[art];
    if (!ov) return base;
    // merge user-entered values onto the data moves (keeps pveDamageMult, notes…); extra user rows are appended
    const out = base.map((m) => { const o = ov.find((x) => x.key === m.key); if (!o) return m; const r = Object.assign({}, m); ['damage', 'hits', 'castTime', 'cooldown', 'damageMeasuredVs', 'name'].forEach((k) => { if (o[k] !== undefined && o[k] !== '' && o[k] !== null) r[k] = o[k]; }); r.userEntered = true; return r; });
    ov.filter((o) => !base.some((m) => m.key === o.key)).forEach((o) => out.push(Object.assign({ userEntered: true }, o)));
    return out;
  }
  const usable = (m) => m.damage !== null && m.damage !== '' && m.damage !== undefined && !isNaN(+m.damage);
  const timed = (m) => usable(m) && m.castTime !== null && m.castTime !== '' && m.cooldown !== null && m.cooldown !== '' && !isNaN(+m.castTime) && !isNaN(+m.cooldown);
  function skillMult(a, art) {
    if (!art) return { mult: 1, parts: [] };
    const isB = !!IDX.breathings[art], parts = [];
    let m = 1;
    const stats = resolvedStats(a);
    if (isB && stats.breathingDamageFactor !== 1) { m *= stats.breathingDamageFactor; parts.push(['Breathing Damage Factor (sum of titles)', stats.breathingDamageFactor]); }
    if (!isB && stats.evilArtDamageFactor !== 1) { m *= stats.evilArtDamageFactor; parts.push(['Evil Art Damage Factor (titres + progression)', stats.evilArtDamageFactor]); }
    if (a.elemArt[art]) { m *= a.elemArt[art]; parts.push([`Bonus ${art} (clan/mode)`, a.elemArt[art]]); }
    if (a.mult !== 1) { m *= a.mult; parts.push(['Marques / multiplicateurs finaux', a.mult]); }
    return { mult: m, parts };
  }
  function pveMult(m, target) {
    if (target !== 'npc' || !m.pveDamageMult) return 1;
    if (m.damageMeasuredVs === 'npc') return 1; // already included in the measured value
    return +m.pveDamageMult;
  }
  function moveFinal(m, skillMultV, flatPerHit, target) { return usable(m) ? +m.damage * skillMultV * pveMult(m, target) + flatPerHit * num(+m.hits, 0) : null; }
  function simulate(moves, windowSec, hps, m1Dmg, skillMultV, flatPerHit, target) {
    const gcd = num(C.globalSkillCooldownSec, 0);
    const ms = moves.filter(timed).map((m) => ({ key: m.key, name: m.name, dmg: moveFinal(m, skillMultV, flatPerHit, target || 'npc'), cast: Math.max(+m.castTime, 0.01), cd: +m.cooldown, ready: 0, count: 0 }));
    let t = 0, total = 0, m1Hits = 0, gcdReady = 0; const hitTime = 1 / hps; const log = [];
    let guard = 0;
    while (t < windowSec - 1e-9 && guard++ < 100000) {
      const ready = ms.filter((m) => m.ready <= t + 1e-9 && gcdReady <= t + 1e-9 && t + m.cast <= windowSec + 1e-9).sort((x, y) => y.dmg / y.cast - x.dmg / x.cast);
      if (ready.length) { const m = ready[0]; total += m.dmg; m.count++; m.ready = t + m.cd; gcdReady = t + gcd; log.push([+t.toFixed(2), m.key]); t += m.cast; continue; }
      if (m1Dmg === null || t + hitTime > windowSec + 1e-9) break;
      total += m1Dmg; m1Hits++; t += hitTime;
    }
    return { total, m1Hits, m1Damage: m1Hits * (m1Dmg || 0), casts: ms.map((m) => ({ key: m.key, name: m.name, count: m.count, dmgEach: m.dmg })), log };
  }

  /* ---------------- evaluate ---------------- */
  function evaluate(bIn, opts) {
    opts = opts || {}; const fid = opts.formula || C.formula;
    const b = normalizeBuild(bIn);
    const { comps, flags } = collect(b);
    const aAll = withAutoCI(aggregate(comps), fid), aPerm = aggregate(comps, (c) => c.temporary);
    const m1 = m1From(aAll, fid), m1Perm = m1From(aPerm, fid);
    const m1Fin = finFrom(aAll, fid), m1FinPerm = finFrom(aPerm, fid), m1Avg = avgHit(m1, m1Fin), m1AvgPerm = avgHit(m1Perm, m1FinPerm);
    const hps = hitsPerSec(aAll), hpsPerm = hitsPerSec(aPerm);
    // contributions (leave-one-out on the full set)
    const displayComp = c => c.group === 'ci-auto' ? { ...c, group: 'flat', value: aAll.ciAutoApplied || 0,
      label: `${c.label} : +${fmtN(aAll.ciAutoApplied || 0)} AD` } : c;
    const contrib = opts.contributions === false ? comps.map(displayComp) : comps.map((c) => {
      const aw = aggregate(comps, (x) => x === c); const without = m1From(aw, fid);
      const dM1 = m1 !== null && without !== null ? m1 - without : null;
      const dps = m1Avg !== null ? m1Avg * hps : null; const wAvg = avgHit(without, finFrom(aw, fid)); const dpsW = wAvg !== null ? wAvg * hitsPerSec(aw) : null;
      return Object.assign({}, displayComp(c), { deltaM1: c.group === 'base' ? m1 : dM1, deltaDps: c.group === 'base' ? null : dps !== null && dpsW !== null ? dps - dpsW : null });
    });
    const usedConf = comps.filter((c) => ['base', 'flat', 'factor', 'clan', 'post', 'mult', 'ci-auto'].includes(c.group)).map((c) => c.confidence);
    const confM1 = minConf(usedConf.concat([C.formulaConfidence]));
    const confHps = minConf(comps.filter((c) => c.group === 'asf').map((c) => c.confidence).concat([C.m1CadenceConfidence]));
    // skills
    const moves = movesFor(b.art); const sm = skillMult(aAll, b.art); const smPerm = skillMult(aPerm, b.art);
    const flatSkill = C.temporaryFlatMode === 'postFlat' ? aAll.post : 0;
    const skillRows = moves.map((m) => ({ key: m.key, name: m.name, verified: !!m.verified, base: usable(m) ? +m.damage : null, pve: pveMult(m, b.target), pveKind: m.pveKind, final: moveFinal(m, sm.mult, flatSkill, b.target), castTime: m.castTime, cooldown: m.cooldown, cooldownSource: m.cooldownSource || null, hits: m.hits, notes: m.notes || [], blockDamageChanges: m.blockDamageChanges || [] }));
    if (skillRows.some((r) => r.pve !== 1 && r.pveKind === 'scaling' && r.final !== null)) flags.push('pveScalingApprox');
    const anyMove = skillRows.some((r) => r.final !== null), anyTimed = moves.some(timed);
    const skillOnce = anyMove ? skillRows.reduce((s, r) => s + (r.final || 0), 0) : null;
    let burst = null, sustained = null, burstSim = null, sustSim = null;
    if (anyTimed) {
      burstSim = simulate(moves, C.burstWindowSec, hps, m1Avg, sm.mult, flatSkill, b.target); burst = burstSim.total;
      const T = C.sustainWindowSec, u = num(+b.uptime, C.defaultTempUptime);
      const sT = simulate(moves, T, hps, m1Avg, sm.mult, flatSkill, b.target), sP = simulate(moves, T, hpsPerm, m1AvgPerm, smPerm.mult, 0, b.target);
      sustSim = sT; sustained = (u * sT.total + (1 - u) * sP.total) / T;
    }
    const allFlags = new Set(flags);
    comps.forEach((c) => (c.flags || []).forEach((f) => allFlags.add(f)));
    if (C.globalSkillCooldownSec === null && anyTimed) allFlags.add('gcdUnknown');
    return {
      build: b, formula: fid, comps: contrib, agg: aAll, aggPerm: aPerm,
      hitStages: hitStages(aAll, fid),
      m1Terms: m1Terms(aAll, fid), m1PermTerms: m1Terms(aPerm, fid),
      finTerms: m1Terms(aAll, fid, true), finPermTerms: m1Terms(aPerm, fid, true),
      ciEstimate: aAll.ciEstimate || null,
      m1, m1Perm, m1Fin, m1FinPerm, m1Avg, m1AvgPerm, hitsPerSec: hps, hitsPerSecPerm: hpsPerm,
      dps: m1Avg === null ? null : m1Avg * hps, dpsPerm: m1AvgPerm === null ? null : m1AvgPerm * hpsPerm,
      chain: m1 === null ? null : m1 * (C.m1ChainHits - 1) + m1Fin, chainTime: aAll.span / resolvedStats(aAll).attackSpeedFactor, cycleTime: aAll.cycle / resolvedStats(aAll).attackSpeedFactor,
      skill: { rows: skillRows, once: skillOnce, mult: sm, anyMove, anyTimed }, burst, burstSim, sustained, sustSim,
      conf: { m1: confM1, hps: confHps, dps: minConf([confM1, confHps]), skill: anyMove ? 'unverified' : 'unverified' },
      flags: [...allFlags], validation: validateBuild(b),
    };
  }

  // Independent of saved temporary settings: used by permanent-M1 product views.
  function evaluatePermanent(b, opts) {
    return evaluate({ ...b, toggles: { temp: false, mode: false, mark: false }, conds: {},
      inputs: { ciMode: 'auto', ciStored: 0, recentSkillDamage: 0, stacks: {} } }, opts);
  }

  function explainFormula(res, finisher = false) {
    const stats = resolvedStats(res.agg);
    const fin = C.m1Finisher || { baseMult: 1, adMult: 1 };
    const a = { ...res.agg, base: res.agg.baseKnown ? res.agg.base * (finisher ? fin.baseMult : 1) : null, A: stats.additionalDamage * (finisher ? fin.adMult : 1), Fsum: stats.additionalDamageFactor - 1 - res.agg.clan }, f = res.formula, d = (x) => x === null ? (finisher ? `${fin.baseMult} × B` : 'B') : fmt(x, 4);
    const pieces = { F1: `${d(a.base)} + ${d(a.A)} × ${d(a.Fprod)} × (1 + ${d(a.clan)})`, F2: `${d(a.base)} + ${d(a.A)} × (1 + ${d(a.Fsum)} + ${d(a.clan)})`, F3: `(${d(a.base)} + ${d(a.A)}) × ${d(a.Fprod)} × (1 + ${d(a.clan)})`, F4: `(${d(a.base)} + ${d(a.A)}) × (1 + ${d(a.Fsum)} + ${d(a.clan)})`, F5: `${d(a.base)} + ${d(a.A)} × (${d(a.Fprod)} + ${d(a.clan)})`, F6: `${d(a.base)} + ${d(a.A)}  (ADF ignored)` };
    let s = pieces[f]; if (a.post) s += ` + ${d(a.post)} (bonus plat temporaire)`;
    if (a.mult !== 1) s = `(${s}) × ${d(a.mult)} (combat damage effects)`;
    return s;
  }
  function fmt(v, dec) { if (v === null || v === undefined || Number.isNaN(v)) return '—'; const k = dec === undefined ? C.displayDecimals : dec; return (+v).toLocaleString('en-US', { maximumFractionDigits: k, minimumFractionDigits: 0 }); }

  window.PS2Engine = { fightDps, fightDpsRaw, huntPct, bleedOf, weaponArts, weaponArtOk, laneCarries, hitStages, seriesTierMult, itemStatsAt, equipSlots, nightfallHuntOn, weaponStatsAt, timingOf, hitsPerSec, resolveName, baseForWeaponObj, finFrom, avgHit, D, C, IDX, CONF_RANK, minConf, srcOf, entrySources, ruleValue, slotOf, catOf, catMax, catLabel, itemLabel, equipList, slotTypes, factionAllowed, equippable, defaultBuild, normalizeBuild, validateBuild, weaponStats, collect, aggregate, core, m1From, hitsPerSec, evaluate, explainFormula, fmt, movesFor, setMoveOverrides, timed, usable, simulate, moveFinal, pveMult, skillMult, activeEffects };
  window.PS2EngineFactory = initEngine;
  Object.assign(window.PS2Engine, { statRound, resolvedStats, combatIntuition, withAutoCI, evaluatePermanent, m1Terms });
})();
