/* PS2 CALC: build optimizer (dominance pruning per equipment category + exhaustive search over item multisets). Uses PS2Engine.core so it always matches the calculator. */
(function initOptimizer() {
  'use strict';
  const E = window.PS2Engine, D = E.D, C = E.C;
  const vecKey = (v) => JSON.stringify(v);
  const dominates = (a, b) => { let strict = false; for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return false; if (a[i] > b[i]) strict = true; } return strict; };
  function paretoLayers(groups, L, canDominate = (a, b) => dominates(a.vec, b.vec)) {
    let rest = groups.slice(); const out = [];
    for (let l = 0; l < L && rest.length; l++) {
      const layer = rest.filter((g) => !rest.some((h) => h !== g && canDominate(h, g)));
      layer.forEach((g) => { g.layer = l + 1; out.push(g); });
      rest = rest.filter((g) => !layer.includes(g));
    }
    return out;
  }
  function groupEq(items, vecFn, identityNames, keyFn = v => v) {
    const m = new Map();
    items.forEach((it) => { const v = vecFn(it); const k = vecKey(keyFn(v)) + (identityNames && identityNames.has(it.name) ? '|' + it.name : ''); if (!m.has(k)) m.set(k, { rep: it, vec: v, members: [] }); m.get(k).members.push(it.name); });
    return [...m.values()];
  }
  const confOk = (c, excludeLow) => !excludeLow || (c !== 'low' && c !== 'unverified');

  function modeInfo(mode) {
    return {
      m1: { label: 'Best M1 damage', needsMoves: false }, dps: { label: 'Best M1 DPS', needsMoves: false }, fin: { label: 'Best 5th hit (M1 burst)', needsMoves: false }, artf: { label: 'Best skill multiplier (art)', needsMoves: false },
      overall: { label: 'Best overall (sustained M1 DPS + skills)', needsMoves: true }, burst: { label: `Best burst (${C.burstWindowSec} s)`, needsMoves: true },
      boss: { label: `Best sustained boss DPS (${C.sustainWindowSec} s)`, needsMoves: true }, skill: { label: 'Best skill damage (1 use of each)', needsMoves: true },
    }[mode];
  }
  function movesReady(art) { return E.movesFor(art).some(E.timed); }

  function run(opts) {
    const t0 = performance.now();
    const fid = opts.formula || C.formula; const mode = opts.mode || 'm1'; const topN = opts.topN || C.optimizer.topN;
    const partialM1 = opts.scoreMetric === 'additional-m1';
    if (partialM1 && (fid !== 'F2' || mode !== 'm1' || opts.includeTemp)) return { error: 'Ranking the known contribution needs permanent M1 and the reference formula.' };
    const tpl = E.normalizeBuild(opts.template || E.defaultBuild(opts.faction)); tpl.faction = opts.faction; const rules = tpl.rules || {};
    delete tpl.equipmentDuplicatesRemoved; // New combinations are not the repaired saved loadout.
    const owned = opts.owned || new Set(); const useOwned = !!opts.ownedOnly;
    const info = modeInfo(mode);
    if (info.needsMoves && !movesReady(tpl.art)) return { error: `“${info.label}” needs skill data (damage, cast time, cooldown) for the chosen art. Enter your measurements in the calculator (Skills section).` };
    if (!opts.includeTemp) { tpl.toggles = { temp: false, mode: false, mark: false }; tpl.conds = {}; tpl.inputs = { ciStored: 0, recentSkillDamage: 0, stacks: {} }; }
    const warnings = [];
    // M1/finisher do not depend on attack speed or art factors. Retaining
    // those axes used to explode the frontier without changing the winner.
    const damageOnly = mode === 'm1' || mode === 'fin';
    const ciCadence = opts.includeTemp && tpl.toggles.temp && tpl.inputs.ciMode === 'auto';
    const productMatters = ['F1', 'F3', 'F5'].includes(fid), sumMatters = ['F2', 'F4', 'F5'].includes(fid);
    const damageVector = v => [v[0], ...(productMatters ? [v[1]] : []), ...(sumMatters ? [v[2]] : []), ...(ciCadence ? [v[3] || 0] : [])];
    const itemDamageVector = v => damageOnly ? [v[0], ...(fid === 'F6' ? [] : [v[1]]), ...(ciCadence ? [v[2]] : [])] : v;
    const itemDominates = (a, b) => dominates(itemDamageVector(a), itemDamageVector(b));
    // ---------------- equipment (5 shared slots, no per-type cap, one copy per identity) ----------------
    const WT = +opts.tier || 1, WR = +opts.refine || 0; // weapons (and Series items, tier only) evaluated at this tier / refine
    const ET = Math.max(1, Math.min(3, WT));
    const MAXE = D.rules.maxEquipSlots;
    const cats = [...new Set([...(D.rules.equipCategoryOrder || []), ...E.equippable().map(E.catOf)])];
    const excl = D.rules.mutualExclusions || [];
    const constrained = new Set(excl.flat());
    // These identities gate the recovered set contract in PS2Engine. Their
    // presence must survive grouping/pruning even when flat stats are worse.
    const setNames = new Set(['Nightfall Top', 'Nightfall Bottom']);
    const identityNames = new Set([...constrained, ...setNames]);
    const itemVec = (it) => { const st = E.itemStatsAt(it, ET); return [st.ad, st.adf, (st.asf || 1) - 1]; };
    const perCat = {}; const pruneInfo = {};
    cats.forEach((c) => {
      let items = E.equippable().filter((it) => E.catOf(it) === c && E.factionAllowed(it.faction, opts.faction, rules) && confOk(it.confidence, opts.excludeLow) && (!useOwned || owned.has(it.name)));
      items = items.filter((it) => identityNames.has(it.name) || (it.additionalDamage || 0) > 0 || (it.additionalDamageFactor || 1) > 1 || (it.attackSpeedFactor || 1) > 1);
      const groups = groupEq(items, itemVec, identityNames, itemDamageVector);
      const cap = Math.min(E.catMax(c), MAXE);
      // Each item at most once, so a group is dropped only when `cap` distinct items
      // (counting identical members) dominate it.
      const need = cap + ((opts.layers || 2) - 1); // extra margin keeps near-optimal alternatives for the top-N list
      const kept = groups.filter((g) => identityNames.has(g.rep.name) || groups.reduce((n, h) => n + (h !== g && !identityNames.has(h.rep.name) && (!info.needsMoves || h.vec[2] === g.vec[2]) && itemDominates(h.vec, g.vec) ? h.members.length : 0), 0) < need);
      kept.forEach((g) => { g.maxUse = Math.min(g.members.length, cap); });
      perCat[c] = { cap, kept }; pruneInfo[c] = { candidates: items.length, groups: groups.length, kept: kept.length, keptNames: kept.map((g) => g.rep.name + (g.members.length > 1 ? ` (×${g.members.length} equiv.)` : '')) };
    });
    const units = []; cats.forEach((c) => perCat[c].kept.forEach((g) => units.push({ c, g })));
    const accAll = new Map(); let rawAcc = 0;
    const catUsed = {}; const pick = [];
    (function dfs(u, filled, A, Fp, Fs, asf) {
      if (u === units.length) {
        const setKey = [...setNames].filter(n => pick.some(x => x.g.rep.name === n)).join('|');
        rawAcc++; const k = vecKey(damageOnly ? damageVector([A, Fp, Fs, asf]) : [A, Fp, Fs, asf]) + '|' + setKey;
        if (!accAll.has(k)) accAll.set(k, { A, Fp, Fs, asf, setKey, vec: [A, Fp, Fs, asf], pick: pick.map((x) => ({ g: x.g, n: x.n })), alts: 0 }); else accAll.get(k).alts++;
        return;
      }
      const { c, g } = units[u]; const it = g.rep; const [ad, f, sp] = g.vec;
      dfs(u + 1, filled, A, Fp, Fs, asf); // not used
      const names = pick.map((x) => x.g.rep.name);
      if (excl.some(([a, b2]) => (a === it.name && names.includes(b2)) || (b2 === it.name && names.includes(a)))) return;
      let nA = A, nFp = Fp, nFs = Fs, nAsf = asf;
      for (let n = 1; n <= g.maxUse && filled + n <= MAXE && (catUsed[c] || 0) + n <= perCat[c].cap; n++) {
        nA += ad; nFp *= f; nFs += f - 1; nAsf += sp;
        catUsed[c] = (catUsed[c] || 0) + n; pick.push({ g, n });
        dfs(u + 1, filled + n, nA, nFp, nFs, nAsf);
        pick.pop(); catUsed[c] -= n;
      }
    })(0, 0, 0, 1, 0, 0);
    // drop dominated equipment combinations (keeps `layers` Pareto layers so the top-N list still shows runner-ups)
    const accSorted = [...accAll.values()].sort((x, y) => y.A - x.A || y.Fs - x.Fs || y.Fp - x.Fp || y.asf - x.asf);
    let restAcc = accSorted; const accKept = [];
    for (let l = 0; l < (opts.layers || 2) && restAcc.length; l++) {
      const front = [], next = [];
      restAcc.forEach((x) => { (front.some((f) => f.setKey === x.setKey && (!info.needsMoves || f.asf === x.asf) && dominates(damageOnly ? damageVector(f.vec) : f.vec, damageOnly ? damageVector(x.vec) : x.vec)) ? next : front).push(x); });
      accKept.push(...front); restAcc = next;
    }
    const accCombos = accKept;
    // ---------------- titles ----------------
    const allTitles = D.titles.data;
    const unlocked = new Set(opts.titlePool === 'unlocked' ? (tpl.unlockedTitles || []) : allTitles.map((t) => t.name));
    let pool = allTitles.filter((t) => unlocked.has(t.name) && confOk(t.confidence, opts.excludeLow));
    const tv = (t) => { const b = t.buffWhileEquipped || {}; const artOk = !t.appliesToArt || t.appliesToArt === tpl.art; return [b.additionalDamage || 0, b.additionalDamageFactor || 1, (b.attackSpeedFactor || 1) - 1, artOk ? b.breathingDamageFactor || 1 : 1, artOk ? b.evilArtDamageFactor || 1 : 1]; };
    pool = pool.filter((t) => tv(t).some((x, i) => (i === 0 || i === 2 ? x > 0 : x > 1)) || (C.titlePassiveMode === 'equippedOnly' && t.passiveAlwaysOn && t.passiveAlwaysOn.additionalDamage > 0));
    const maxT = D.rules.maxTitles || 3;
    const tCombos = [];
    const passiveOf = (n) => { const t = E.IDX.titles[n]; return (t && t.passiveAlwaysOn && t.passiveAlwaysOn.additionalDamage) || 0; };
    const chooseK = Math.min(maxT, pool.length);
    (function comb(start, pick) {
      if (pick.length === chooseK) {
        let A = 0, Fp = 1, Fs = 0, asf = 0, eb = 1, ee = 1;
        pick.forEach((t) => { const v = tv(t); A += v[0]; Fp *= v[1]; Fs += v[1] - 1; asf += v[2]; eb += v[3] - 1; ee += v[4] - 1; });
        const names = pick.map((t) => t.name);
        const passSet = C.titlePassiveMode === 'none' ? new Set() : C.titlePassiveMode === 'equippedOnly' ? new Set(names) : new Set([...unlocked, ...names]);
        passSet.forEach((n) => { const p = E.IDX.titles[n]?.passiveAlwaysOn || {}; A += passiveOf(n); Fp *= p.additionalDamageFactor || 1; Fs += (p.additionalDamageFactor || 1) - 1; asf += (p.attackSpeedFactor || 1) - 1; eb += (p.breathingDamageFactor || 1) - 1; ee += (p.evilArtDamageFactor || 1) - 1; });
        tCombos.push({ A, Fp, Fs, asf, eb, ee, names }); return;
      }
      for (let i = start; i < pool.length; i++) { pick.push(pool[i]); comb(i + 1, pick); pick.pop(); }
    })(0, []);
    if (!tCombos.length) {
      const empty = { A: 0, Fp: 1, Fs: 0, asf: 0, eb: 1, ee: 1, names: [] };
      if (C.titlePassiveMode === 'equippedAndUnlocked') unlocked.forEach(n => { const p = E.IDX.titles[n]?.passiveAlwaysOn || {}; empty.A += passiveOf(n); empty.Fp *= p.additionalDamageFactor || 1; empty.Fs += (p.additionalDamageFactor || 1) - 1; empty.asf += (p.attackSpeedFactor || 1) - 1; empty.eb += (p.breathingDamageFactor || 1) - 1; empty.ee += (p.evilArtDamageFactor || 1) - 1; });
      tCombos.push(empty);
    }
    // Prune completed title selections, not individual titles: distinct-title
    // capacity is already respected. Ignore art/speed axes for a pure M1 goal.
    const titleChoices = damageOnly ? paretoLayers(groupEq(tCombos, t => damageVector([t.A, t.Fp, t.Fs, t.asf])), opts.layers || 2).map(g => g.rep) : tCombos;
    // gear = accessories × titles (deduped)
    const gear = new Map();
    accCombos.forEach((a) => titleChoices.forEach((t) => {
      const v = [a.A + t.A, a.Fp * t.Fp, a.Fs + t.Fs, a.asf + t.asf, t.eb, t.ee];
      const k = vecKey(damageOnly ? damageVector(v) : ['dps'].includes(mode) ? v.slice(0, 4) : v) + '|' + a.setKey;
      if (!gear.has(k)) gear.set(k, { v, acc: a, tit: t });
    }));
    const gearList = [...gear.values()];
    // ---------------- weapons ----------------
    let wItems = D.weapons.data.filter((w) => !w.unobtainable && !D.rules.optimizerExcludeWeapons.includes(w.name) && E.factionAllowed(w.faction, opts.faction, rules) && E.weaponArtOk(w, opts.faction, opts.artFilter || null) && confOk(w.confidence, opts.excludeLow) && (!useOwned || owned.has(w.name)));
    if (opts.weaponMode === 'fixed' && opts.fixedWeapon) wItems = wItems.filter((w) => w.name === opts.fixedWeapon);
    if (opts.weaponType) wItems = wItems.filter((w) => w.type === opts.weaponType);
    if (!wItems.length) return { error: 'No weapon matches these constraints.' };
    const wOv = opts.weaponOverrides || {};
    const hasBaseOv = tpl.baseOverride !== null && tpl.baseOverride !== '' && tpl.baseOverride !== undefined;
    if (hasBaseOv && (!Number.isFinite(+tpl.baseOverride) || +tpl.baseOverride < 0)) return { error: 'Invalid manual base.' };
    if (!partialM1 && !hasBaseOv && wItems.some(w => !E.baseForWeaponObj(w, tpl.mastery))) return { error: 'M1 base unknown: no total or absolute ranking can be calculated.' };
    const FIN = C.m1Finisher || { baseMult: 1, adMult: 1 }, NH = C.m1ChainHits;
    const wStat = (w) => { const o = wOv[w.name] || {}; const st = E.weaponStatsAt(w, WT, WR, o); return { ad: st.ad || 0, adf: st.adf || 1, tier: st.tier, refine: st.refine, overridden: !!(o.ad || o.adf) }; };
    const wCyc = (w) => E.timingOf(w).cycleSec; // seconds per 5-hit chain incl. the post-finisher delay (game combat preset)
    // Conditional contracts depend on weapon type. Never prune a fist/sword
    // candidate using stats of a different type before evaluating its effects.
    const weaponVector = w => { const s = wStat(w); const wb = hasBaseOv || partialM1 ? null : E.baseForWeaponObj(w, tpl.mastery); return [s.ad, s.adf, -wCyc(w), wb ? wb.value : -1]; };
    const weaponLayers = items => paretoLayers(groupEq(items, weaponVector), opts.weaponLayers || 3,
      (a, b) => (!info.needsMoves || a.vec[2] === b.vec[2]) && dominates(a.vec, b.vec));
    const wGroups = opts.includeTemp ? [...new Set(wItems.map(w => w.type))].flatMap(type => weaponLayers(wItems.filter(w => w.type === type))) : weaponLayers(wItems);
    // ---------------- clans (+ fixed template parts: base, skill nodes, progression, set effects) ----------------
    let clanNames = D.clans.data.filter((c) => confOk(c.confidence, opts.excludeLow) && (!useOwned || owned.has(c.name))).map((c) => c.name);
    if (opts.clanMode === 'fixed') {
      if (opts.fixedClan && !clanNames.includes(opts.fixedClan)) return { error: 'The fixed clan is not among the allowed choices.' };
      clanNames = [opts.fixedClan || null];
    }
    if (!clanNames.length) clanNames = [null];
    const restGroups = new Map();
    clanNames.forEach((cn) => {
      const b = Object.assign({}, tpl, { clan: cn, weapon: null, equipment: [], titles: [null, null, null], unlockedTitles: [] });
      const { comps } = E.collect(b); const a = E.aggregate(comps), perm = E.aggregate(comps, x => x.temporary);
      const signature = a => [a.base, a.A, a.Fprod, a.Fsum, a.clan, a.post, a.mult, a.asfBonus, a.elemEvilAdd, a.elemArt[tpl.art] || 1, a.baseKnown ? 1 : 0];
      const k = vecKey(signature(a).concat(signature(perm))) + (opts.includeTemp ? '|' + cn : '');
      if (!restGroups.has(k)) restGroups.set(k, { a, perm, clans: [] }); restGroups.get(k).clans.push(cn);
    });
    const rests = [...restGroups.values()];
    if (!partialM1 && hasBaseOv && rests.some((r) => !r.a.baseKnown)) return { error: 'Invalid manual base.' };
    // ---------------- skill model cache (by hits/s) ----------------
    const moves = E.movesFor(tpl.art); const isBreathing = !!E.IDX.breathings[tpl.art];
    const simCache = new Map();
    const rotation = (windowSec, hps, avg, sm, flat) => {
      // Greedy casting order depends on actual damage/flat-per-hit, not only
      // on cadence. Cache the real engine simulation by all of its inputs.
      const k = vecKey([windowSec, hps, avg, sm, flat]); if (simCache.has(k)) return simCache.get(k);
      const total = E.simulate(moves, windowSec, hps, avg, sm, flat, tpl.target || 'npc').total;
      simCache.set(k, total); return total;
    };
    const skillOnceBase = moves.filter(E.usable).reduce((s, m) => s + +m.damage * E.pveMult(m, tpl.target || 'npc'), 0);
    const skillOnceHits = moves.filter(E.usable).reduce((s, m) => s + (+m.hits || 0), 0);
    // ---------------- search ----------------
    const top = []; let evals = 0; let threshold = -Infinity;
    const setRestCache = new Map();
    const restWithSet = (r, g, w) => {
      if (!opts.includeTemp) return { a: r.a, perm: r.perm };
      const k = r.clans[0] + '|' + g.acc.setKey + '|' + w.type;
      if (!setRestCache.has(k)) {
        const equipment = g.acc.pick.flatMap(({ g, n }) => g.members.slice(0, n));
        const b = { ...tpl, clan: r.clans[0], weapon: w.name, equipment, equipTier: equipment.map(() => ET), titles: [null, null, null], unlockedTitles: [] };
        // The gear vector already contains item stats. Recollect only the fixed
        // part plus activated set effects, using the calculator's own contract.
        const { comps } = E.collect(b);
        const fixed = comps.filter(x => !x.id.startsWith('eq_') && !x.id.startsWith('w_'));
        setRestCache.set(k, { a: E.aggregate(fixed), perm: E.aggregate(fixed, x => x.temporary) });
      }
      return setRestCache.get(k);
    };
    const push = (score, payload) => {
      if (top.length >= topN && score <= threshold) return;
      top.push(Object.assign({ score }, payload)); top.sort((x, y) => y.score - x.score); if (top.length > topN) top.pop();
      threshold = top.length >= topN ? top[top.length - 1].score : -Infinity;
    };
    const round = (v) => (C.damageRounding === 'round' ? Math.round(v) : C.damageRounding === 'floor' ? Math.floor(v) : v);
    for (const wg of wGroups) {
      // Nightfall bleed (damage over time, % of the target's max HP): added to the DPS score when a target HP is given
      const bleed = mode === 'dps' && opts.bleedHp ? ((E.bleedOf({ weapon: wg.rep.name, tier: Math.min(+opts.tier || 1, wg.rep.maxTier || 1) }, opts.bleedHp) || {}).dps || 0) : 0;
      const ws = wStat(wg.rep); const cyc = wCyc(wg.rep); const wbObj = hasBaseOv ? null : E.baseForWeaponObj(wg.rep, tpl.mastery);
      for (const r of rests) {
        for (const g of gearList) {
          const fixed = restWithSet(r, g, wg.rep), a = fixed.a;
          evals++;
          const [gA, gFp, gFs, gAsf, eb, ee] = g.v;
          const A = a.A + ws.ad + gA, Fp = a.Fprod * ws.adf * gFp, Fs = a.Fsum + (ws.adf - 1) + gFs;
          const base = wbObj ? wbObj.value : a.base;
          const merged = { ...a, base, baseKnown: hasBaseOv || !!wbObj, A, Fprod: Fp, Fsum: Fs, cycle: cyc, asfBonus: a.asfBonus + gAsf, elemBreathing: a.elemBreathing + eb - 1, elemEvil: a.elemEvil + ee - 1 };
          const m1 = E.m1From(merged, fid);
          const fin = E.finFrom(merged, fid); const avg = ((NH - 1) * m1 + fin) / NH;
          const hps = E.hitsPerSec(merged);
          let score;
          if (mode === 'm1') score = partialM1 ? E.m1Terms(merged, fid).offset : m1;
          else if (mode === 'dps') score = opts.bleedHp ? E.fightDpsRaw(avg * hps, bleed, ET >= 3 && /Nightfall Top/.test(g.acc.setKey) && /Nightfall Bottom/.test(g.acc.setKey)) : avg * hps;
          else if (mode === 'fin') score = fin;
          else if (mode === 'artf') { const sm = E.skillMult(merged, tpl.art).mult; score = sm + m1 * 1e-7; }
          else {
            const sm = E.skillMult(merged, tpl.art).mult;
            const flat = C.temporaryFlatMode === 'postFlat' ? a.post : 0;
            if (mode === 'skill') score = skillOnceBase * sm + flat * skillOnceHits;
            else if (mode === 'burst') score = rotation(C.burstWindowSec, hps, avg, sm, flat);
            else {
              const p = fixed.perm, pA = p.A + ws.ad + gA, pFp = p.Fprod * ws.adf * gFp, pFs = p.Fsum + (ws.adf - 1) + gFs;
              const permMerged = { ...p, base, baseKnown: hasBaseOv || !!wbObj, A: pA, Fprod: pFp, Fsum: pFs, cycle: cyc, asfBonus: p.asfBonus + gAsf, elemBreathing: p.elemBreathing + eb - 1, elemEvil: p.elemEvil + ee - 1 };
              const pM1 = E.m1From(permMerged, fid);
              const pFin = E.finFrom(permMerged, fid);
              const pAvg = ((NH - 1) * pM1 + pFin) / NH, pHps = E.hitsPerSec(permMerged);
              const pSm = E.skillMult(permMerged, tpl.art).mult;
              const uptime = Number.isNaN(+tpl.uptime) ? C.defaultTempUptime : +tpl.uptime;
              score = (uptime * rotation(C.sustainWindowSec, hps, avg, sm, flat) + (1 - uptime) * rotation(C.sustainWindowSec, pHps, pAvg, pSm, 0)) / C.sustainWindowSec;
            }
          }
          push(score, { wg, r, g, m1, hps });
        }
      }
    }
    // ---------------- materialize ----------------
    const results = top.map((t, i) => {
      const b = JSON.parse(JSON.stringify(tpl));
      b.name = `Optimiseur #${i + 1}`; b.weapon = t.wg.rep.name; { const st = wStat(t.wg.rep); b.tier = st.tier; b.refine = st.refine; }
      if (b.conds.fists && t.wg.rep.type !== 'fist') b.conds.fists = false;
      const o = wOv[b.weapon]; b.weaponOverride = o ? { ad: o.ad ?? null, adf: o.adf ?? null } : { ad: null, adf: null };
      b.clan = t.r.clans[0]; b.equipment = []; const altItems = {};
      t.g.acc.pick.forEach(({ g, n }) => { const use = g.members.slice(0, n); b.equipment.push(...use); const rest = g.members.slice(n); use.forEach((m) => { altItems[m] = rest; }); });
      b.equipTier = b.equipment.map(() => ET);
      b.titles = t.g.tit.names.concat([null, null, null]).slice(0, 3);
      b.unlockedTitles = opts.titlePool === 'unlocked' ? (tpl.unlockedTitles || []) : D.titles.data.map((x) => x.name);
      const res = E.evaluate(b, { formula: fid });
      const alts = { weapon: t.wg.members.filter((n) => n !== b.weapon), clan: t.r.clans.slice(1), items: altItems };
      return { rank: i + 1, score: t.score, build: b, res, alts };
    });
    const resultScore = (e, b) => ({ m1: partialM1 ? e.m1PermTerms.offset : e.m1, dps: opts.bleedHp ? E.fightDps(b, e.dps, opts.bleedHp) : e.dps, fin: e.m1Fin,
      artf: e.skill.mult.mult + e.m1 * 1e-7, skill: e.skill.once,
      burst: e.burst, boss: e.sustained, overall: e.sustained })[mode];
    const check = results.map(x => Math.abs(resultScore(x.res, x.build) - x.score)).reduce((m, v) => Math.max(m, v), 0);
    if (check > 1e-7) return { error: 'Mismatch between the search and the calculator: results hidden.' };
    warnings.push('Alternatives shown are not an exhaustive Top N of all builds.');
    return { tier: WT, refine: WR, mode, info, fid, results, scoreKind: partialM1 ? 'additional-m1' : 'total-m1', stats: { ms: Math.round(performance.now() - t0), evals, accCombosRaw: rawAcc, accCombos: accAll.size, accCombosKept: accCombos.length, titleCombos: tCombos.length, gear: gearList.length, weapons: wGroups.length, clanGroups: rests.length, pruneInfo, maxEngineMismatch: check, alternativesExhaustive: false }, warnings };
  }
  window.PS2Optimizer = { run, modeInfo, movesReady };
  window.PS2OptimizerFactory = initOptimizer;
})();
