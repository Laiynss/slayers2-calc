/* PS2 CALC: "Meilleur build" (best build per goal). Damage goals reuse the optimizer (same numbers as the calculator);
   stat goals (speed, tank) rank complete builds on summed game stats (weapon, 5 items with Series tier, clan, titles, progression). */
(function initBestBuild() {
  'use strict';
  const E = window.PS2Engine, O = window.PS2Optimizer, D = E.D, C = E.C;
  const GOALS = [
    { id: 'm1', label: 'Damage per hit (M1)', kind: 'opt', mode: 'm1' },
    { id: 'dps', label: 'M1 DPS (damage per second)', kind: 'opt', mode: 'dps' },
    { id: 'burst', label: 'Burst: 5th hit of the M1 chain', kind: 'opt', mode: 'fin' },
    { id: 'skills', label: 'Skills (Breathing / Evil Art multiplier)', kind: 'opt', mode: 'artf' },
    { id: 'speed', label: 'Speed (movement × attack speed)', kind: 'stat' },
    { id: 'tank', label: 'Tank (HP, damage reduction, block, regen)', kind: 'stat' },
  ];
  /* stat keys stored as 1 + bonus in the data (factors, regen speeds); the others are flat adds */
  const ADD_KEYS = new Set(['maxHealth', 'maxStamina', 'damageReduction', 'blockPoints']);
  const isFactor = (k) => !ADD_KEYS.has(k);
  const ZERO = () => ({ maxHealth: 0, maxHealthFactor: 0, maxStamina: 0, damageReduction: 0, damageReductionFactor: 0, blockPoints: 0, blockRegen: 0, healthRegen: 0, staminaRegen: 0, movementSpeedFactor: 0, runSpeedFactor: 0, attackSpeed: 0 });
  function addStats(t, o, mult) {
    Object.entries(o || {}).forEach(([k, v]) => {
      if (typeof v !== 'number') return;
      const key = k === 'attackSpeedFactor' ? 'attackSpeed' : k;
      if (!(key in t)) return;
      t[key] += (key === 'attackSpeed' || isFactor(k) ? v - 1 : v) * (mult || 1);
    });
  }
  function itemStatObj(it) { return Object.assign({}, it.otherStats || {}, it.blockPoints ? { blockPoints: it.blockPoints } : {}, it.attackSpeedFactor ? { attackSpeedFactor: it.attackSpeedFactor } : {}); }
  const GAME_STAT = { maxHealth: 'Max Health', maxHealthFactor: 'Max Health Factor', maxStamina: 'Max Stamina',
    damageReduction: 'Damage Reduction', damageReductionFactor: 'Damage Reduction Factor', blockPoints: 'Block Points',
    blockRegen: 'Block Regen', healthRegen: 'Health Regen Speed', staminaRegen: 'Stamina Regen Speed',
    movementSpeedFactor: 'Movement Speed Factor', runSpeedFactor: 'Run Speed Factor', attackSpeedFactor: 'Attack Speed Factor' };
  /* ActiveTool scales numeric bonuses by tier and GetStatMultiplier. Factors here = 1 + bonus. */
  function weaponStatObj(w, tier, refine) {
    const out = Object.assign({}, w.otherStats || {}, w.blockPoints ? { blockPoints: w.blockPoints } : {}, w.attackSpeedFactor ? { attackSpeedFactor: w.attackSpeedFactor } : {});
    const st = E.weaponStatsAt(w, tier || 1, refine || 0);
    const tiers = w.tierScaling && w.tierScaling.multipliers;
    const tm = tiers && tiers[st.tier] !== undefined ? tiers[st.tier] : 1;
    const refinements = w.refineScaling && w.refineScaling.multipliers;
    const rm = refinements && refinements[st.refine] !== undefined ? refinements[st.refine] : 1;
    const keys = w.refineStats || [];
    Object.keys(out).forEach((k) => {
      if (typeof out[k] !== 'number') return;
      const index = keys.indexOf(GAME_STAT[k]);
      const r = index === 0 ? rm : index > 0 ? 1 + (rm - 1) * (w.secondaryRefineShare ?? 0.5) : 1;
      out[k] = isFactor(k) ? 1 + (out[k] - 1) * tm * r : out[k] * tm * r;
    });
    return out;
  }
  function clanStatObj(c) { return Object.assign({}, c.otherStats || {}, { maxHealth: c.maxHealth || 0, maxStamina: c.maxStamina || 0 }, c.blockPoints ? { blockPoints: c.blockPoints } : {}); }
  function progStatObj(b) {
    if (b.faction !== 'demon' || !b.demonProgress) return {};
    // PlayerProgression.GetEarnedStats sums all earned levels, not only the last.
    const levels = D.progression.data.demonProgress.levels || {};
    const out = { maxHealth: 0, maxHealthFactor: 1, healthRegen: 1 };
    for (let i = 1; i <= Math.min(4, +b.demonProgress); i++) {
      const lv = levels[String(i)] || {};
      out.maxHealth += lv.maxHealth || 0;
      out.maxHealthFactor += (lv.maxHealthFactor || 1) - 1;
      out.healthRegen += (lv.healthRegen || 1) - 1;
    }
    return out;
  }
  /* summed non-damage stats of a build (Series items scale every stat by their tier multiplier, as in PlayerStatResolver/Solvers/Accessory) */
  function statTotals(bIn) {
    const b = E.normalizeBuild(bIn); const t = ZERO();
    const w = b.weapon && E.IDX.weapons[b.weapon]; if (w) addStats(t, weaponStatObj(w, b.tier, b.refine));
    E.equipSlots(b).forEach(({ n, tier }) => { const it = E.IDX.equipment[n]; if (it) addStats(t, itemStatObj(it), it.series ? E.seriesTierMult(tier) : 1); });
    const c = b.clan && E.IDX.clans[b.clan]; if (c) addStats(t, clanStatObj(c));
    const eqT = b.titles.filter(Boolean);
    eqT.forEach((n) => { const x = E.IDX.titles[n]; if (x) addStats(t, x.buffWhileEquipped); });
    const pass = C.titlePassiveMode === 'none' ? [] : C.titlePassiveMode === 'equippedOnly' ? eqT : [...new Set([...(b.unlockedTitles || []), ...eqT])];
    pass.forEach((n) => { const x = E.IDX.titles[n]; if (x) addStats(t, x.passiveAlwaysOn); });
    addStats(t, progStatObj(b));
    return finish(t, w);
  }
  function finish(t, w) {
    const tm = w ? E.timingOf(w) : null; const asfMult = Math.max(1 + t.attackSpeed, 0.25);
    t.hitsPerSec = tm ? C.m1ChainHits / (tm.cycleSec / asfMult) : null;
    t.hp = t.maxHealth * (1 + t.maxHealthFactor);
    t.ehp = t.hp / (1 - Math.min(t.damageReductionFactor, 0.9));
    t.speedScore = (1 + t.movementSpeedFactor) * (t.hitsPerSec || 0);
    return t;
  }
  const sumT = (...xs) => { const t = ZERO(); xs.forEach((x) => Object.keys(t).forEach((k) => { t[k] += x[k] || 0; })); return t; };
  const totOf = (o, mult) => { const t = ZERO(); addStats(t, o, mult); return t; };
  const statScore = (goal, t) => (goal === 'speed' ? t.speedScore : t.ehp + 1e-3 * (t.damageReduction + t.blockPoints + t.blockRegen + t.healthRegen));
  /* dims used for dominance pruning per goal */
  const DIMS = { speed: ['movementSpeedFactor', 'attackSpeed'], tank: ['maxHealth', 'maxHealthFactor', 'damageReductionFactor', 'damageReduction', 'blockPoints', 'blockRegen', 'healthRegen'] };
  const vecOf = (goal, o, mult) => { const t = ZERO(); addStats(t, o, mult); return DIMS[goal].map((k) => t[k]); };
  const dom = (a, b) => a.every((x, i) => x >= b[i]) && a.some((x, i) => x > b[i]);
  function pareto(list, layers) {
    // A dominator is always before its target in descending lexicographic
    // order. Without this sort, a one-pass skyline depends on input order.
    let rest = list.slice().sort((a, b) => { for (let i = 0; i < a.v.length; i++) if (a.v[i] !== b.v[i]) return b.v[i] - a.v[i]; return 0; }); const kept = [];
    for (let l = 0; l < layers && rest.length; l++) {
      const f = [], next = [];
      rest.forEach(x => (f.some(y => dom(y.v, x.v)) ? next : f).push(x));
      kept.push(...f); rest = next;
    }
    return kept;
  }
  function runStat(goal, o) {
    const t0 = performance.now();
    const tpl = o.template; const fac = tpl.faction; const rules = tpl.rules || {}; const ET = Math.max(1, Math.min(3, o.tier || 1));
    const owned = o.owned || new Set(); const own = (n) => !o.ownedOnly || owned.has(n);
    const K = DIMS[goal]; const Z = () => K.map(() => 0); const add = (a, b) => a.map((x, i) => x + b[i]);
    const vec = (obj, mult) => vecOf(goal, obj, mult);
    const MAXE = D.rules.maxEquipSlots;
    // weapons
    let ws = D.weapons.data.filter((w) => !w.unobtainable && !D.rules.optimizerExcludeWeapons.includes(w.name) && E.factionAllowed(w.faction, fac, rules) && E.weaponArtOk(w, fac, o.art || null) && own(w.name));
    if (o.fixedWeapon) ws = ws.filter((w) => w.name === o.fixedWeapon);
    if (o.weaponType) ws = ws.filter((w) => w.type === o.weaponType);
    if (!ws.length) return { error: 'No weapon matches these constraints.' };
    let wv = ws.map((w) => ({ w, v: vec(weaponStatObj(w, o.tier, o.refine)), cyc: E.timingOf(w).cycleSec }));
    wv = pareto(wv.map(W => ({ W, v: goal === 'speed' ? W.v.concat([-W.cyc]) : W.v })), 3).map(x => x.W);
    // clans
    let clans = D.clans.data.filter((c) => own(c.name)); if (o.fixedClan) {
      clans = clans.filter((c) => c.name === o.fixedClan);
      if (!clans.length) return { error: 'The fixed clan is not among the allowed choices.' };
    }
    const cv = pareto(clans.length ? clans.map((c) => ({ c, v: vec(clanStatObj(c)) })) : [{ c: null, v: Z() }], 3);
    // titles (3 distinct), passives counted when the config says equipped-only
    const tvec = (x) => { const v = vec(x.buffWhileEquipped); return C.titlePassiveMode === 'equippedOnly' ? add(v, vec(x.passiveAlwaysOn)) : v; };
    const tl = pareto(D.titles.data.map((x) => ({ x, v: tvec(x) })).filter((x) => x.v.some((y) => y > 0)), 3); let tc = [];
    (function comb(st, pick, v) { if (pick.length === Math.min(3, tl.length)) { tc.push({ names: pick.slice(), v }); return; } for (let i = st; i < tl.length; i++) { pick.push(tl[i].x.name); comb(i + 1, pick, add(v, tl[i].v)); pick.pop(); } })(0, [], Z());
    if (!tc.length) tc.push({ names: [], v: Z() });
    // Completed distinct-title triples have no later title choices. Their
    // frontier can safely be reduced before crossing with weapons/clans.
    tc = pareto(tc, 3);
    // fixed part (progression, unlocked-title passives)
    const b0 = statTotals(Object.assign(JSON.parse(JSON.stringify(tpl)), { weapon: null, clan: null, equipment: [], titles: [null, null, null] }));
    const base = K.map((k) => b0[k]);
    // weapon x clan x titles, pruned on the goal dims (the score is increasing in each dim; speed adds the weapon cadence)
    let wct = [];
    wv.forEach((W) => cv.forEach((Cn) => tc.forEach((T) => { const v = add(add(add(base, W.v), Cn.v), T.v); wct.push({ W, Cn, T, v: goal === 'speed' ? v.concat([-W.cyc]) : v }); })));
    const contextsRaw = wct.length, equivalent = new Map();
    wct.forEach(x => {
      const key = JSON.stringify(x.v), xs = equivalent.get(key) || [];
      // This is a completed weapon/clan/title choice, not an unfinished item
      // selection. Identical objective vectors have identical continuations.
      if (xs.length < 4) xs.push(x); equivalent.set(key, xs);
    });
    wct = [...equivalent.values()].flat();
    wct = pareto(wct, 3);
    // Sound item pruning: replacements must obey the same category constraint;
    // items participating in an exclusion cannot be substituted blindly.
    const exclusions = D.rules.mutualExclusions || [];
    const constrained = new Set(exclusions.flat());
    const candidates = E.equippable().filter(it => E.factionAllowed(it.faction, fac, rules) && own(it.name))
      .map(it => ({ it, v: vec(itemStatObj(it), it.series ? E.seriesTierMult(ET) : 1) }))
      .filter(x => x.v.some(y => y > 0));
    const items = candidates.filter(x => constrained.has(x.it.name) || candidates.filter(y =>
      !constrained.has(y.it.name) && E.catOf(y.it) === E.catOf(x.it) && dom(y.v, x.v)).length < MAXE + 3);
    const sc = (v, cyc) => {
      if (goal === 'speed') { const hps = C.m1ChainHits / (cyc / Math.max(1 + v[1], 0.25)); return (1 + v[0]) * hps; }
      return v[0] * (1 + v[1]) / (1 - Math.min(v[2], 0.9)) + 1e-3 * (v[3] + v[4] + v[5] + v[6]);
    };
    // Never prune a partial combination by its stats alone: its remaining
    // choices depend on its last index/used identities. Branch-and-bound keeps
    // that state and uses an optimistic, component-wise upper bound instead.
    const top = []; let evals = 0, nodes = 0, pruned = 0;
    const threshold = () => top.length < 30 ? -Infinity : top[top.length - 1].score;
    const maxV = K.map((_, k) => Math.max(0, ...items.map(x => x.v[k])));
    wct.sort((a, b) => sc(add(b.v.slice(0, K.length), maxV.map(x => x * MAXE)), b.W.cyc) - sc(add(a.v.slice(0, K.length), maxV.map(x => x * MAXE)), a.W.cyc));
    for (const A of wct) {
      const baseV = A.v.slice(0, K.length);
      // The bound is only used in the nonnegative domain, where this score is
      // monotone. Negative custom data is enumerated without this shortcut.
      const monotone = baseV.every(x => x >= 0) && items.every(x => x.v.every(y => y >= 0));
      const ordered = items.slice().sort((a, b) => sc(add(baseV, b.v), A.W.cyc) - sc(add(baseV, a.v), A.W.cyc));
      const suffix = Array(ordered.length + 1); suffix[ordered.length] = Z();
      for (let i = ordered.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1].map((x, k) => Math.max(x, ordered[i].v[k], 0));
      const pick = [], counts = {};
      (function visit(start, v) {
        nodes++;
        const slots = MAXE - pick.length;
        if (monotone && sc(add(v, suffix[start].map(x => x * slots)), A.W.cyc) < threshold()) { pruned++; return; }
        evals++; const score = sc(v, A.W.cyc);
        if (top.length < 30 || score > threshold()) {
          top.push({ score, A, I: { pick: pick.slice() } }); top.sort((x, y) => y.score - x.score); if (top.length > 30) top.pop();
        }
        if (!slots) return;
        for (let i = start; i < ordered.length; i++) {
          const x = ordered[i], name = x.it.name, cat = E.catOf(x.it);
          if (pick.includes(name) || (counts[cat] || 0) >= E.catMax(cat) || exclusions.some(([a, b]) => (name === a && pick.includes(b)) || (name === b && pick.includes(a)))) continue;
          pick.push(name); counts[cat] = (counts[cat] || 0) + 1;
          visit(i + 1, add(v, x.v));
          pick.pop(); counts[cat]--;
        }
      })(0, baseV);
    }
    // exact totals for the short list, then final ranking (ties broken by the other defensive stats)
    const res = top.map(({ A, I }) => {
      const b = Object.assign(JSON.parse(JSON.stringify(tpl)), { weapon: A.W.w.name, clan: A.Cn.c ? A.Cn.c.name : null, equipment: I.pick.slice(), equipTier: I.pick.map(() => ET), titles: A.T.names.concat([null, null, null]).slice(0, 3) });
      const ws = E.weaponStatsAt(A.W.w, o.tier, o.refine);
      b.tier = ws.tier; b.refine = ws.refine;
      const ov = (o.weaponOverrides || {})[b.weapon];
      b.weaponOverride = ov ? { ad: ov.ad ?? null, adf: ov.adf ?? null } : { ad: null, adf: null };
      return { score: statScore(goal, statTotals(b)), b };
    }).sort((x, y) => y.score - x.score);
    return { results: res, stats: { evals, nodes, pruned, contextsRaw, contextsKept: wct.length, itemCandidates: candidates.length, itemsKept: items.length, ms: Math.round(performance.now() - t0), bestWithinModel: true, alternativesExhaustive: false } };
  }
  function prepTemplate(o) {
    const tpl = E.normalizeBuild(JSON.parse(JSON.stringify(o.calc || E.defaultBuild(o.faction))));
    tpl.faction = o.faction; tpl.tier = o.tier; tpl.refine = o.refine;
    const arts = o.faction === 'slayer' ? D.breathings.data : D.bdas.data;
    if (o.art) tpl.art = o.art; else if (!tpl.art || !arts.some((a) => a.name === tpl.art)) tpl.art = arts[0] ? arts[0].name : null;
    if (o.faction !== 'demon') tpl.demonProgress = 0; else if (!(o.calc && o.calc.faction === 'demon' && o.calc.demonProgress)) tpl.demonProgress = 4;
    if (o.effectScope !== 'current') {
      tpl.toggles = { temp: false, mode: false, mark: false }; tpl.conds = {}; tpl.inputs = { ciStored: 0, recentSkillDamage: 0, stacks: {} };
    }
    if (o.objective === 'm1-permanent' || o.objective === 'dps-permanent') {
      tpl.level = C.maxLevel; tpl.mastery = C.baseM1.maxMastery; tpl.baseOverride = null;
      tpl.skillNodes = D.skilltree.data.filter(n => n.additionalDamage && E.factionAllowed(n.faction, o.faction, tpl.rules)).map(n => n.name);
      if (o.faction === 'demon') tpl.demonProgress = 4;
    }
    if (o.effectScope === 'peak') {
      // Maximize the bounded, non-negative contracts already represented by
      // this engine. This is a conditional scenario, not a game-wide upper bound.
      // CI Soyama uses a first-window M1-only scenario, never an invented cap.
      // Kamado incoming damage and Repetitive Action stay unknown/zero.
      tpl.level = C.maxLevel; tpl.mastery = C.baseM1.maxMastery; tpl.baseOverride = null;
      tpl.skillNodes = D.skilltree.data.filter(n => n.additionalDamage && E.factionAllowed(n.faction, o.faction, tpl.rules)).map(n => n.name);
      tpl.toggles = { temp: true, mode: true, mark: true };
      tpl.inputs.ciMode = 'auto';
      tpl.conds = { hpBelow30: true, hpBelow60: true, hpAbove90: false, airborne: true, targetBelow30: true, party: true, inZone: true, fists: true };
      // Tier/refine remain explicit options; equipment identities are always unique.
    }
    tpl.weapon = null; tpl.equipment = []; tpl.equipTier = []; tpl.titles = [null, null, null]; tpl.clan = null;
    delete tpl.equipmentDuplicatesRemoved;
    tpl.unlockedTitles = D.titles.data.map((t) => t.name); // title pool = all titles (same as the optimizer 'all' pool)
    return tpl;
  }
  /* o: { faction, goal, tier, refine, fixedWeapon, weaponType, art, ownedOnly, owned, calc, formula, weaponOverrides } */
  function run(o) {
    // Product contract, not just a UI default. Obsolete burst/peak flags cannot change this objective.
    if (o.objective === 'm1-permanent') o = { ...o, goal: 'm1', effectScope: 'permanent' };
    if (o.objective === 'dps-permanent') o = { ...o, goal: 'dps', effectScope: 'permanent' };
    const goal = GOALS.find((g) => g.id === o.goal) || GOALS[0];
    let tpl = prepTemplate(o);
    // Unknown bases do not become zero/3/10/katana fits. Optimize the known
    // additive contribution instead, with an explicit non-absolute score kind.
    const candidates = D.weapons.data.filter(w => !w.unobtainable && !D.rules.optimizerExcludeWeapons.includes(w.name) && E.factionAllowed(w.faction, o.faction, tpl.rules) && E.weaponArtOk(w, o.faction, o.art || null)
      && (!o.fixedWeapon || w.name === o.fixedWeapon) && (!o.weaponType || w.type === o.weaponType) && (!o.ownedOnly || (o.owned || new Set()).has(w.name)));
    const unresolvedBases = candidates.filter(w => !E.baseForWeaponObj(w, tpl.mastery)).map(w => w.name);
    const scoreMetric = o.objective === 'm1-permanent' && unresolvedBases.length ? 'additional-m1' : null;
    let out;
    if (goal.kind === 'opt') {
      const arts = goal.mode === 'artf' && !o.art ? (o.faction === 'slayer' ? D.breathings.data : D.bdas.data).map((a) => a.name) : [tpl.art];
      let best = null;
      arts.forEach((art) => {
        const t = Object.assign(JSON.parse(JSON.stringify(tpl)), { art });
        const r = O.run({ tier: o.tier, refine: o.refine, faction: o.faction, mode: goal.mode, topN: 6, template: t, includeTemp: o.effectScope === 'current' || o.effectScope === 'peak', allowDuplicates: false, ownedOnly: !!o.ownedOnly, owned: o.owned || new Set(),
          excludeLow: false, clanMode: 'best', weaponMode: o.fixedWeapon ? 'fixed' : 'best', fixedWeapon: o.fixedWeapon || '', weaponType: o.weaponType || null, titlePool: 'all', weaponOverrides: o.weaponOverrides || {}, formula: o.formula, scoreMetric, bleedHp: goal.mode === 'dps' ? (o.bleedHp || 0) : 0, artFilter: goal.mode === 'artf' ? art : (o.art || null) });
        if (r.error) { best = best || r; return; }
        if (!best || best.error || (r.results[0] && r.results[0].score > best.results[0].score)) best = r;
      });
      if (best.error) return { error: best.error };
      out = { goal, results: best.results.map((x) => ({ score: x.score, b: x.build })), stats: best.stats };
    } else {
      const r = runStat(goal.id, Object.assign({}, o, { template: tpl }));
      if (r.error) return { error: r.error };
      out = { goal, results: r.results, stats: r.stats };
    }
    // distinct builds (best + alternatives), full evaluation with the calculator engine
    const seen = new Set(); const res = [];
    for (const x of out.results) {
      const b = E.normalizeBuild(x.b);
      // the build's art must be one its weapon carries (no art chosen: the first one the weapon allows)
      if (!o.art && b.weapon) { const ok = E.weaponArts(E.IDX.weapons[b.weapon], b.faction); if (ok.length && !ok.includes(b.art)) b.art = ok[0]; }
      b.unlockedTitles = b.unlockedTitles && b.unlockedTitles.length ? b.unlockedTitles : D.titles.data.map((t) => t.name);
      const key = [b.weapon, b.clan, b.art, [...b.equipment].sort().join(','), [...b.titles].sort().join(',')].join('|'); if (seen.has(key)) continue; seen.add(key);
      const ev = E.evaluate(b, { formula: o.formula }); const st = statTotals(b);
      res.push({ score: x.score, build: b, ev, st });
      if (res.length >= 4) break;
    }
    return { goal, results: res, stats: out.stats, objective: o.objective || null, effectScope: o.effectScope || 'permanent',
      scoreKind: scoreMetric || 'total-m1', absoluteMaximumKnown: false, baseInputsComplete: !unresolvedBases.length, unresolvedBases,
      assumptions: o.objective === 'dps-permanent' ? ['Ranked on permanent M1 DPS: average hit of the 5-hit chain × hits per second (game cadence, Combat_presets)' + (o.bleedHp ? `, over a whole kill of a ${o.bleedHp.toLocaleString('en-US')} HP target: Nightfall bleed added, Nightfall Hunt (+15 % on the last 30 % of HP) when its set is worn.` : '.'), 'Max mastery (400), all AD nodes and all titles unlocked; max Demon Progress when it applies.', 'No mode, mark, Combat Intuition or other conditional effect included.'] : o.objective === 'm1-permanent' ? [scoreMetric ? 'Base unknown: ranked on the permanent AD × permanent ADF contribution only, not on total M1.' : 'Ranked on permanent normal M1 per hit: (base + permanent AD) × permanent ADF.', 'Max mastery (400), all AD nodes and all titles unlocked; max Demon Progress when it applies.', 'No mode, mark, Combat Intuition, storage, HP state or other conditional effect included.', 'Tier/refine and available items follow the chosen constraints; up to five distinct items.', 'DPS and 5th hit are shown for information only; they do not decide the ranking.'] : o.effectScope === 'peak' ? ['Max mastery and all AD nodes.', 'Conditional peak: HP below 30 %, target below 30 %, aerial attack when it applies, clan buffs/mode/mark active.', 'All titles unlocked. Tier/refine = chosen values; up to five distinct items.', 'Soyama CI estimated: M1 DPS without CI over 12 s, surviving target without reduction, conditions kept. Kamado CI and Repetitive Action not estimated: damage taken or caps unknown.', 'Support from other clans, target resistances and unmodelled passives excluded.'] : [] };
  }
  /* cumulative refine cost 0 -> R (successful attempts only), from CAM/Global/Refinement */
  function refineCost(R) {
    const steps = ((D.obtain || {}).data || {}).refine ? D.obtain.data.refine.steps : [];
    const c = { ore: 0, mythic: 0, wen: 0 };
    steps.filter((s) => s.from < R).forEach((s) => { if (s.ore === 'Refinement Ore') c.ore += s.count; else c.mythic += s.count; c.wen += s.wen; });
    return c;
  }
  window.PS2Best = { GOALS, run, statTotals, refineCost };
  window.PS2BestFactory = initBestBuild;
})();
