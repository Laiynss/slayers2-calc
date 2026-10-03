/* ============================================================================
 * PS2 CALC: FORMULA & CONSTANTS CONFIG (the ONLY place to switch the formula)
 * Source audit: PlayerStatResolver establishes summed stats (3 decimals).
 * Combat_Util's final damage implementation is absent from this extraction.
 * F1-F6 remain exploration hypotheses, not
 * six recovered game formulas. See archives/rapports/DAMAGE_SOURCE_AUDIT.md.
 * ========================================================================== */
window.PS2_CONFIG = {
  /* Active formula id. One of the keys of `formulas` below.
   *  F1  Final = Base + ΣAD × Π(item ADF) × (1 + clan%)            (items multiply)
   *  F2  Final = Base + ΣAD × (1 + Σ(item ADF − 1) + clan%)        (additive pool: DEFAULT. CONFIRMED for the stat bar on 2026-09-27:
   *      1.418x = 1 + Σ(x−1) of 6 items + 17 % clan, exact. Whether M1 uses it (vs F6) awaits the dummy test)
   *  F3  Final = (Base + ΣAD) × Π(item ADF) × (1 + clan%)          (flat before factors)
   *  F4  Final = (Base + ΣAD) × (1 + Σ(item ADF − 1) + clan%)      (flat before additive pool)
   *  F5  Final = Base + ΣAD × (Π(item ADF) + clan%)                (items multiply, clan adds)
   *  F6  Final = Base + ΣAD                                        (ADF does not affect M1: fits the old 19.37 hit
   *      only with base 9.52, which was itself derived from that hit, so the fit is circular) */
  formula: 'F4',
  formulaConfidence: 'medium', // User-provided structure; numeric inputs retain their own confidence.
  formulaStructureSource: {
    type: 'measured', date: '2026-09-29',
    normal: '(Base + Additional Damage) × ADF',
    finisher: '(2 × Base + Additional Damage) × ADF',
    scope: 'Before separate effects on combat damage; not an extracted Combat_Util implementation.'
  },
  formulas: {
    F1: { label: 'F1: Base + ΣAD × Π(ADF) × (1+clan%)', short: 'multiplicatif' },
    F2: { label: 'F2: Base + ΣAD × (1 + Σ%ADF + clan%)', short: 'additive pool' },
    F3: { label: 'F3: (Base + ΣAD) × Π(ADF) × (1+clan%)', short: 'plat avant facteurs' },
    F4: { label: 'F4: (Base + ΣAD) × (1 + Σ%ADF + clan%)', short: 'plat avant pool additif' },
    F5: { label: 'F5: Base + ΣAD × (Π(ADF) + clan%)', short: 'items ×, clan +' },
    F6: { label: 'F6: Base + ΣAD (ADF ignored for M1)', short: 'ADF has no M1 effect' },
  },

  maxLevel: 225,

  /* Base M1 = 3 + 0,027 × maîtrise de l'arme tenue (maîtrise max 400, gameSettings.maxMastery) ; ne dépend pas du niveau.
   * 3 = BaseStats.M1Damage (gameSettings.module.luau:102). Coup normal = (base + AD) × ADF, 5e coup = (2 × base + AD) × ADF.
   * Reproduit au centième : griffes maîtrise 325 (77,96), mains nues 45 (29,15 / 34,61), Bladed Wagasa 4 (31,24 / 35,39). */
  baseM1: { value: 3, perMastery: 0.027, maxMastery: 400 },

  /* 5-hit chain = 4 normal hits + 1 finisher. Finisher = core(base × baseMult, AD × adMult):
   * with F2 → 2 × base + AD × (1 + Σ%ADF + clan%). Structure supplied by the user;
   * it does not establish the numeric base or target modifiers. */
  m1Finisher: { baseMult: 2, adMult: 1, confidence: 'high', source: 'Measured in game on 2026-09-29: only the base is doubled.' },

  /* M1 cadence (game data, CAM/Global/Combat_presets): the server lets the next hit through after the preset's `default` delay
   * (hits 2-5) and `final` delay after the finisher (next chain), both divided by attackSpeedMult = max(1 + sum(Attack Speed Factor), 0.25).
   * Each weapon carries its own timing (weapons.json m1Timing). Katanas 0.25 s, claws 0.30 s, gauntlet / fists 0.26 s, axe & mace 0.356 s;
   * 1.65 s after every finisher. Sustained cycle = 4 x default + final. */
  m1ChainHits: 5,
  defaultM1Timing: { preset: 'Combat', betweenHits: 0.26, afterFinisher: 1.65, hits: 5, chainSpanSec: 1.04, cycleSec: 2.69 },
  m1CadenceConfidence: 'high',
  /* Player observations used to check the cadence model (not shown in the UI).
   * 2026-09-28: Firstlight Insect Katana does its 5-hit chain in about 1.0 s, visibly faster than Nightfall Claws.
   * Game data: katana chain span 4 x 0.25 = 1.00 s vs claws 4 x 0.30 = 1.20 s. The Insect's 1.2243x tooltip line is Movement Speed Factor
   * (its second refine stat), not attack speed. */
  m1CadenceObservations: [
    { weapon: 'Firstlight Insect Katana', tier: 3, refine: 9, movementSpeedFactor: 1.2243, chainSecondsMax: 1.0, fasterThan: 'Nightfall Claws', date: '2026-09-28', modelChainSeconds: 1.0 },
    { weapon: 'Butterfly Katana', tier: 1, refine: 0, speedFactor: 1, chainSeconds: 1.15, date: '2026-09-27' },
  ],

  /* How temporary clan ADF (modes, low HP, zones…) combines:
   *  'addToClanPct'   → added to the clan's permanent % (e.g. 19 % + 12 %)
   *  'separateFactor' → extra factor (1 + x %) */
  clanTempAdfMode: 'addToClanPct',

  /* Where still-unresolved Repetitive Action flat bonuses are added.
   * Combat Intuition is NOT governed by this switch: EffectServer writes
   * storage * 0.1 to Additional Damage, so the engine adds it before ADF.
   *  'postFlat' → added to the final M1 after factors (in-game text says "added to Weapon … damage")
   *  'asAD'     → treated as Additional Damage (scaled by factors) */
  temporaryFlatMode: 'postFlat',

  /* Marks / damagePct effects multiply the final hit. */
  markMode: 'finalMultiplier',

  /* Title passive: 'equippedAndUnlocked' counts the passive of every unlocked title
   * (sportsrant); 'equippedOnly' counts it only for equipped titles; 'none' ignores passives.
   * CONFIRMED 2026-09-27 by the in-game title tooltip: 'Buffs' apply only while equipped,
   * 'Passives' apply once unlocked, so keep 'equippedAndUnlocked'. */
  titlePassiveMode: 'equippedAndUnlocked',

  /* Damage popups rounding (unknown): 'none' | 'round' | 'floor'. */
  damageRounding: 'none',
  displayDecimals: 2,

  /* Skills: entered move damage is treated as BASE damage for one use; the engine
   * multiplies it by element/breathing/evil-art factors and marks. Whether AD/ADF
   * also scale skills is unknown → false. */
  skillsUseAdditiveDamage: false,
  burstWindowSec: 10,
  sustainWindowSec: 60,
  defaultTempUptime: 1.0,            // sustained DPS: fraction of time temporary buffs are active
  globalSkillCooldownSec: null,      // v0.140 added global skill cooldowns; value unknown → treated as 0 (flagged)

  optimizer: { topN: 10, maxCombos: 5e7 },
  version: { patch: 'V0.195', patchDate: '2026-10-02', dataCompiled: '2026-10-02' },
};
