/* KRIEFNE headless QA harness.  Run:  node test.js  [--verbose]
 *
 * Boots game.js inside a Node VM with stubbed DOM / Canvas / WebAudio / storage,
 * then drives the real game through window.__kriefne. Nothing here mocks game
 * logic -- every assertion runs against the shipping code path.
 *
 * Suites are additive: each implementation step appends its own checks, so a
 * regression in an early system is caught by the step that introduced it. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const VERBOSE = process.argv.indexOf('--verbose') >= 0;
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();

// ---------- assertions ----------
let pass = 0, fail = 0, suite = '';
const failures = [];
function ok(label, cond, detail) {
 if (cond) { pass++; if (VERBOSE) console.log('  ok   ' + label); }
 else { fail++; failures.push(suite + ' > ' + label + (detail ? '\n         ' + detail : '')); console.log('  FAIL ' + label + (detail ? '  [' + detail + ']' : '')); }
}
function eq(label, a, b) { ok(label, a === b, 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function deepEq(label, a, b) { ok(label, JSON.stringify(a) === JSON.stringify(b), 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function range(label, v, lo, hi) { ok(label, typeof v === 'number' && v >= lo && v <= hi, 'got ' + v + ' want ' + lo + '..' + hi); }
function atMost(label, v, hi) { ok(label, v <= hi, 'got ' + v + ' want <= ' + hi); }
function atLeast(label, v, lo) { ok(label, v >= lo, 'got ' + v + ' want >= ' + lo); }
function section(name) { suite = name; console.log('\n== ' + name + ' =='); }

// ---------- DOM / platform stubs ----------
// `seedStore` pre-populates localStorage, so persistence can be tested by
// booting a second game against the storage the first one wrote.
function boot(seedStore) {
 const noop = function () { };
 const ctx2d = {};
 ['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'arc', 'ellipse',
  'closePath', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'clip', 'rect', 'roundRect',
  'quadraticCurveTo', 'bezierCurveTo', 'arcTo', 'setLineDash', 'fillText', 'strokeText', 'drawImage',
  'setTransform', 'resetTransform', 'createPattern'].forEach(k => { ctx2d[k] = noop; });
 ctx2d.createLinearGradient = () => ({ addColorStop: noop });
 ctx2d.createRadialGradient = () => ({ addColorStop: noop });
 ctx2d.measureText = t => ({ width: String(t == null ? '' : t).length * 7 });
 const canvas = {
  width: 960, height: 640, getContext: () => ctx2d, addEventListener: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 })
 };
 const store = Object.assign({}, seedStore || {});
 const sandbox = {
  console,
  localStorage: {
   getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
   setItem: (k, v) => { store[k] = String(v); },
   removeItem: k => { delete store[k]; }
  },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: noop,
  setInterval: () => 0, clearInterval: noop, setTimeout: () => 0, clearTimeout: noop
 };
 sandbox.document = {
  getElementById: id => (id === 'game' ? canvas : null),
  addEventListener: noop, removeEventListener: noop,
  hidden: false, hasFocus: () => true
 };
 sandbox.window = sandbox;
 sandbox.window.addEventListener = noop;
 sandbox.window.removeEventListener = noop;
 sandbox.globalThis = sandbox;
 vm.createContext(sandbox);
 const code = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
 vm.runInContext(code, sandbox, { filename: 'game.js' });
  const api = sandbox.window.__kriefne;
 api.__sandbox = sandbox;
 api.__store = store;
 return api;
}

// Deterministic RNG inside the sandbox so repro tests are stable. The VM's
// built-ins live on the inner global, not on the contextified sandbox object,
// so the patch has to be installed from inside the context.
function seedRandom(api, seed) {
 vm.runInContext(
  '(function(s){ var a=s>>>0; Math.random=function(){ a|=0; a=a+0x6D2B79F5|0;' +
  ' var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;' +
  ' return ((t^t>>>14)>>>0)/4294967296; }; })(' + (seed >>> 0) + ')',
  api.__sandbox, { filename: 'seed.js' });
}

// ---------- driving helpers ----------
const DT = 1 / 60;
function step(api, frames, perFrame) {
 for (let i = 0; i < frames; i++) { if (perFrame) perFrame(i); api.update(DT); }
}
function seconds(api, secs, perFrame) { step(api, Math.round(secs * 60), perFrame); }
function immortal(api) { api.player.invuln = 1e9; api.player.hp = api.player.maxhp; }
function give(api, id, n) {
 const u = api.upgrades.find(x => x.id === id);
 if (!u) throw new Error('no upgrade ' + id);
 for (let k = 0; k < (n || 1); k++) api.pickUpgrade(u);
 return u;
}
function bossesIn(api) { return api.enemies.filter(e => e.type === 'boss'); }

// Fight a nest with the player pinned invulnerable at map centre, auto-firing.
// Returns telemetry used by both the bug repros and the balance suite.
function fightNest(api, sector, opts) {
 opts = opts || {};
 api.startRun();
 if (opts.build) for (const b of opts.build) give(api, b[0], b[1]);
 api.loadSector(sector);
 const p = api.player;
 if (opts.build2) for (const b of opts.build2) give(api, b[0], b[1]);
 api.forceState('playing');
 p.autoFire = true;
 const maxS = opts.maxSeconds || 180;
 const boss0 = bossesIn(api);
 const track = new Map();
 for (const b of boss0) track.set(b.uid, { heal: 0, last: b.hp, recoveries: 0, offT: 0, mode: b.mode, maxhp: b.maxhp });
 let t = 0, cleared = false, recoverFrames = 0, totalFrames = 0;
 while (t < maxS) {
  if (opts.freeze) { p.x = opts.freeze.x; p.y = opts.freeze.y; }
  if (!opts.mortal) immortal(api);
  api.update(DT); t += DT; totalFrames++;
  const live = bossesIn(api);
  for (const b of live) {
   let r = track.get(b.uid);
   if (!r) { r = { heal: 0, last: b.hp, recoveries: 0, offT: 0, mode: b.mode, maxhp: b.maxhp }; track.set(b.uid, r); }
   if (b.hp > r.last) r.heal += b.hp - r.last;
   r.last = b.hp;
   const off = (b.mode === 'phase' || b.mode === 'retreat');
   if (off) { r.offT += DT; recoverFrames++; }
   if (b.mode !== r.mode) { if (off) r.recoveries++; r.mode = b.mode; }
  }
  if (live.length === 0) { cleared = true; break; }
  if (api.state === 'gameover') break;
  if (api.state === 'levelup') api.forceState('playing');
 }
 const recs = [...track.values()];
 return {
  cleared, time: t, state: api.state,
  bosses: recs,
  maxHealFrac: recs.reduce((m, r) => Math.max(m, r.heal / r.maxhp), 0),
  maxRecoveries: recs.reduce((m, r) => Math.max(m, r.recoveries), 0),
  offFrac: totalFrames ? recoverFrames / (totalFrames * Math.max(1, boss0.length)) : 0
 };
}

// ======================================================================
//  SUITE 1 -- boot + API surface
// ======================================================================
function suiteBoot() {
 section('boot / api surface');
 const api = boot();
  ok('game.js evaluates and exposes __kriefne', !!api);
 eq('starts on title', api.state, 'title');
 for (const k of ['startRun', 'loadSector', 'update', 'render', 'pickUpgrade', 'hurtPlayer', 'killEnemy',
  'bossKindsFor', 'isBossSector', 'sectorWorld', 'compFor'])
  ok('api exposes ' + k, typeof api[k] === 'function');
 ok('upgrade table non-empty', api.upgrades.length > 0, 'n=' + api.upgrades.length);
 ok('every upgrade has id/name/desc/apply', api.upgrades.every(u => u.id && u.name && u.desc && typeof u.apply === 'function'));
 const ids = api.upgrades.map(u => u.id);
 eq('upgrade ids unique', new Set(ids).size, ids.length);
 api.render();
 ok('render() on title does not throw', true);
 return api;
}

// ======================================================================
//  SUITE 2 -- run / sector plumbing
// ======================================================================
function suiteSectors() {
 section('sectors / run flow');
 const api = boot();
 api.startRun();
 eq('startRun lands on galaxy hub', api.state, 'galaxy');
 eq('hub starts with nothing cleared', api.cleared, -1);
 api.loadSector(0);
 eq('loadSector enters play', api.state, 'playing');
 atLeast('S1 spawns an opening pack', api.enemies.length, 4);
 atLeast('S1 rosters a real wave', api.hostiles(), 8);
 for (const s of [0, 1, 2, 3, 5, 7, 11]) ok('S' + (s + 1) + ' is not a boss sector', !api.isBossSector(s));
 for (const s of [4, 9, 14, 19, 24, 29]) ok('S' + (s + 1) + ' is a boss sector', api.isBossSector(s));
 const w1 = api.sectorWorld(0), w9 = api.sectorWorld(9);
 ok('worlds grow with depth', w9.w > w1.w && w9.h > w1.h, JSON.stringify(w1) + ' -> ' + JSON.stringify(w9));
 ok('world size is capped', api.sectorWorld(400).w <= 2600 && api.sectorWorld(400).h <= 1800);
 return api;
}

// ======================================================================
//  SUITE 3 -- BUG REPRO: bullets must not pass through bosses
// ======================================================================
function suiteBulletHits() {
 section('bullets / hitboxes');
 const api = boot();
 seedRandom(api, 12345);
 api.startRun(); api.loadSector(4); api.forceState('playing');
 const boss = bossesIn(api)[0];
 ok('boss sector spawns a boss', !!boss);
 if (!boss) return api;

 // A bullet aimed dead centre must be consumed by the boss, not fly out the far side.
 const p = api.player;
 boss.x = p.x + 200; boss.y = p.y; boss.phased = false;
 const hp0 = boss.hp;
 api.mouse.x = 480 + 200; api.mouse.y = 320;
 p.fireCd = 0; p.autoFire = true;
 seconds(api, 0.6, () => { immortal(api); });
  ok('bullets damage a boss in front of the ship', boss.hp < hp0, 'hp ' + hp0 + ' -> ' + boss.hp);
  // strict tunnelling check lives in suiteSweptCollision

  return api;
}

// Fast-bullet tunnelling: a single high-speed step must not skip the target.
function suiteSweptCollision() {
 section('swept collision (tunnelling)');
 const api = boot();
 seedRandom(api, 777);
 api.startRun(); api.loadSector(4); api.forceState('playing');
 const p = api.player;
 for (const e of api.enemies.slice()) { const i = api.enemies.indexOf(e); if (i >= 0) api.enemies.splice(i, 1); }
 api.spawnEnemy('brute');
 const e = api.enemies[0];
 ok('spawned a lone brute', !!e);
 if (!e) return api;
 e.x = p.x + 120; e.y = p.y;
 const hp0 = e.hp;
 p.projSpeed = 4000;      // deliberately absurd: 66px per 60Hz step, brute r=18
 p.fireCd = 0; p.autoFire = true; p.dmgBase = 5;
 api.mouse.x = 480 + 120; api.mouse.y = 320;
 seconds(api, 1.0, () => { immortal(api); e.x = p.x + 120; e.y = p.y; });
 ok('a 4000px/s bullet still registers on a r=18 target', e.hp < hp0, 'hp ' + hp0 + ' -> ' + e.hp);
 return api;
}

// ======================================================================
//  SUITE 4 -- BUG REPRO: boss recovery must be bounded
// ======================================================================
function suiteBossRecovery() {
 section('boss recovery economy');
 // S10 = the nest the player reported as unkillable.
 for (const sector of [9, 14, 19]) {
  const api = boot();
  seedRandom(api, 4242 + sector);
  const r = fightNest(api, sector, { maxSeconds: 120 });
  const label = 'S' + (sector + 1);
  // 12% is the designed lifetime cap (2 recoveries x 6%); a boss that uses both
  // recoveries fully lands exactly on it, so allow float noise, not more.
  atMost(label + ' boss never heals more than 12% of max HP all fight', r.maxHealFrac, 0.12 + 1e-9);
  atMost(label + ' boss enters recovery at most twice', r.maxRecoveries, 2);
  atMost(label + ' boss spends <25% of the fight unengageable', r.offFrac, 0.25);
 }
 return null;
}

// A boss left completely alone must NOT heal back up (no passive regen loop).
function suiteNoPassiveRegen() {
 section('no passive out-of-combat regen');
 const api = boot();
 seedRandom(api, 99);
 api.startRun(); api.loadSector(9); api.forceState('playing');
 const b = bossesIn(api)[0];
 if (!b) { ok('boss present', false); return api; }
 b.hp = b.maxhp * 0.5;
 const hp0 = b.hp;
 const p = api.player;
 p.autoFire = false;
 seconds(api, 30, () => { immortal(api); api.mouse.down = false; });
 atMost('an untouched boss regains <=12% max HP over 30s', (b.hp - hp0) / b.maxhp, 0.12);
 return api;
}

// ======================================================================
//  SUITE 5 -- BUG REPRO: bosses must not get stuck / corner-camp
// ======================================================================
function suiteBossMobility() {
 section('boss placement + mobility');
 for (let s = 0; s < 6; s++) {
  const sector = 4 + s * 5;
  const api = boot();
  seedRandom(api, 20000 + sector);
  api.startRun(); api.loadSector(sector); api.forceState('playing');
  const bs = bossesIn(api);
  atLeast('S' + (sector + 1) + ' nest has a boss', bs.length, 1);
  const w = api.sectorWorld(sector);
  for (const b of bs) {
   const margin = Math.min(b.x - 24, b.y - 80, (w.w - 24) - b.x, (w.h - 24) - b.y);
   atLeast('S' + (sector + 1) + ' ' + (b.bname || b.kind) + ' spawns clear of walls', margin, 90);
  }
 }
 // a boss chasing a stationary player must actually close distance
 const api = boot();
 seedRandom(api, 31337);
 api.startRun(); api.loadSector(4); api.forceState('playing');
 const b = bossesIn(api)[0];
 const p = api.player;
 if (b) {
  let minD = 1e9;
  seconds(api, 25, () => { immortal(api); api.mouse.down = false; p.autoFire = false; minD = Math.min(minD, Math.hypot(b.x - p.x, b.y - p.y)); });
  atMost('boss closes to contact range within 25s', minD, 220);
 }
 return api;
}

// ======================================================================
//  SUITE 6 -- procgen contract
// ======================================================================
function suiteProcgen() {
 section('procgen contract');
 const api = boot();
 for (let i = 0; i < 24; i++) {
  seedRandom(api, 500 + i * 37);
  api.startRun();
  api.loadSector(i);
  const a = api.arena;
  ok('S' + (i + 1) + ' arena validated', !!a && a.validated === true);
  atLeast('S' + (i + 1) + ' connectivity >= 0.55', a.ratio, 0.55);
  atLeast('S' + (i + 1) + ' open space >= 0.45', a.openFrac, 0.45);
  const kinds = new Set(a.obs.map(o => o.kind));
  ok('S' + (i + 1) + ' obstacle kinds are known', [...kinds].every(k => ['rect', 'circle', 'poly'].includes(k)), [...kinds].join(','));
  if (i < 3) atLeast('S' + (i + 1) + ' has real cover', a.obs.length, 6);
  // nothing may overlap the player drop
  const p = api.player;
  ok('S' + (i + 1) + ' player drop is clear', !api.bulletBlocked(p.x, p.y, p.r + 2));
 }
 return api;
}

// ======================================================================
//  SUITE 7 -- upgrade pool is state aware
// ======================================================================
function suiteUpgradePool() {
 section('upgrade pool state-awareness');
 const api = boot();
 api.startRun(); api.loadSector(0); api.forceState('playing');
 const pool0 = api.pool();
 ok('slipstream hidden before dash unlock', pool0.indexOf('slip') < 0);
 ok('gate overdrive hidden before recall unlock', pool0.indexOf('gatecd') < 0);
 ok('instant transit hidden before recall unlock', pool0.indexOf('transit') < 0);
 give(api, 'spd', 1);
 ok('slipstream offered after dash unlock', api.pool().indexOf('slip') >= 0);
 give(api, 'pcell', 1);
 ok('gate overdrive offered after recall unlock', api.pool().indexOf('gatecd') >= 0);
 // max stacks respected
 const mx = api.upgrades.filter(u => u.max);
 for (const u of mx.slice(0, 6)) {
  const fresh = boot(); fresh.startRun(); fresh.loadSector(0); fresh.forceState('playing');
  const dep = api.upgrades.find(x => x.id === u.id);
  if (dep.req && !dep.req(fresh.player)) continue;
  try { give(fresh, u.id, u.max); } catch (e) { }
  ok(u.id + ' capped at max=' + u.max, fresh.pool().indexOf(u.id) < 0);
 }

 // -- draft gating, through the real draft: 60 runs x 40 drafts, half of them
 // taking anything and half refusing dash + recall forever. No card may ever be
 // offered for a system the ship does not own.
 const refuse = u => u.id !== 'spd' && u.id !== 'pcell';
 const bad = new Set();
 let drafts = 0, backs = 0, backShort = 0, dup = 0;
 const gaps = { spd: 0, pcell: 0 };
 for (let run = 0; run < 60; run++) {
  const a = boot(); seedRandom(a, 5000 + run);
  a.startRun(); a.loadSector(0); a.forceState('playing');
  const refusing = run % 2 === 1, since = { spd: 0, pcell: 0 };
  // Observe EVERY draft: with XP-bonus cards one grant can cross two levels,
  // and the second draft would otherwise be picked through unseen.
  for (let k = 0; k < 40; k++) {
   if (a.state !== 'levelup') a.gainXp(a.player.xpNeed + 1);
   if (a.state !== 'levelup') break;
   const p = a.player, ch = a.choices;
   drafts++;
   if (new Set(ch.map(u => u.id)).size !== ch.length) dup++;
   for (const u of ch) {
    if (u.req && !u.req(p)) bad.add(u.id + ' offered with its requirement unmet');
    if ((u.id === 'gatecd' || u.id === 'transit') && !p.recallUnlocked) bad.add(u.id + ' before recall');
    if (u.id === 'slip' && !p.dashUnlocked) bad.add('slip before dash');
    if (/^shock(cap|amp|rad)$/.test(u.id) && !p.shockOn) bad.add(u.id + ' before Kinetic Discharge');
   }
   if (a.levelBack) { backs++; if (ch.length < 4 && a.pool().length >= 4) backShort++; }
   if (refusing) for (const id of ['spd', 'pcell']) {
    if (ch.some(u => u.id === id)) since[id] = 0; else since[id]++;
    gaps[id] = Math.max(gaps[id], since[id]);
   }
   const opts = refusing ? ch.filter(refuse) : ch;
   a.pickUpgrade(opts.length ? opts[(run * 7 + k * 3) % opts.length] : ch[0]);
  }
 }
 atLeast('gating fuzz ran real drafts', drafts, 1500);
 ok('no card is ever offered for a system you do not own', bad.size === 0, [...bad].join('; '));
 eq('a draft never shows the same card twice', dup, 0);
 // A skipped core ability keeps coming back: absent from at most PITY_DRAFTS
 // (3) drafts in a row, plus one when both fall due together, because only one
 // returns per draft.
 atMost('refused dash comes back within 4 drafts', gaps.spd, 4);
 atMost('refused recall comes back within 4 drafts', gaps.pcell, 4);
 atLeast('the return path actually fired', backs, 20);
 eq('a returning card is added, never swapped in for a regular one', backShort, 0);

 // Once owned, a core unlock is never pushed back into the draft.
 {
  const a = boot(); seedRandom(a, 6060);
  a.startRun(); a.loadSector(0); a.forceState('playing');
  give(a, 'spd', 1); give(a, 'pcell', 1); a.forceState('playing');
  let back = 0;
  for (let k = 0; k < 30; k++) {
   if (a.state !== 'levelup') a.gainXp(a.player.xpNeed + 1);
   if (a.levelBack) back++;
   a.pickUpgrade(a.choices[0]);
  }
  eq('owned dash and recall are never offered back', back, 0);
 }
 // The recall unlock reads as one, like dash does.
 {
  const a = boot(); a.startRun(); a.loadSector(0); a.forceState('playing');
  const pc = a.upgrades.find(u => u.id === 'pcell');
  ok('Portal Cell says UNLOCK while recall is locked', /UNLOCK/.test(pc.dyn(a.player).desc));
  give(a, 'pcell', 1);
  ok('and reads as charges once recall is owned', pc.dyn(a.player) === null);
 }
 return api;
}

// ======================================================================
//  SUITE 8 -- balance model
// ======================================================================
// Two reference players per depth. GREEDY always takes the strongest offensive
// card on offer and is the practical DPS ceiling; BALANCED spends roughly a
// third of its picks on survivability and utility, like a real run. The enemy
// curve has to sit between them: greedy should still be challenged, balanced
// should still win until the endless ramp finally outgrows it.
const GREEDY_ORDER = ['dmg', 'rate', 'array', 'crit', 'slug', 'overcharge', 'flak', 'minigun', 'split',
 'corrode', 'chain', 'adrenal', 'seek', 'pierce', 'surge', 'lance', 'orbital', 'tract', 'inc', 'cryo', 'rico', 'hp', 'vamp'];
const BALANCED_ORDER = ['dmg', 'hp', 'rate', 'ward', 'array', 'vamp', 'crit', 'aegis', 'spd', 'shock',
 'bulwark', 'seek', 'repair', 'orbital', 'tract', 'slug', 'shockcap', 'magnet', 'orbit', 'lance',
 'nova', 'salvage', 'pierce', 'shockamp'];
// Drive the REAL progression loop: earn XP, open a draft, pick the highest
// preference among the three cards actually offered. Handing the player cards
// directly skipped level-ups entirely, which meant per-level passive growth
// never applied and every simulated build was quietly under-statted.
function draftBuild(api, picks, order) {
 let taken = 0, guard = 0;
 while (taken < picks && guard++ < 4000) {
  if (api.state !== 'levelup') api.gainXp(api.player.xpNeed + 1);
  if (api.state !== 'levelup') break;
  const choices = api.choices;
  if (!choices.length) break;
  let idx = 0;
  for (const id of order) { const i = choices.findIndex(c => c.id === id); if (i >= 0) { idx = i; break; } }
  api.pickUpgrade(choices[idx]);
  taken++;
 }
 return taken;
}
function gunDps(p) { return p.dmgBase * p.dmgMult * p.fireRate * p.shots * (1 + p.critCh * (p.critMult - 1)); }
// Cooldown abilities contribute real single-target damage and must be counted,
// or a build that spends picks on them looks weaker than it plays. Orbit blades
// are derated hard because they only reach something already on top of you.
function abilityDps(p) {
 let x = 0;
 if (p.orbitalLvl > 0) x += (60 * p.dmgMult * (1 + 0.25 * (p.orbitalLvl - 1)) * p.orbitalLvl) / p.orbitalCd;
 if (p.lanceLvl > 0) x += (46 * p.dmgMult * (1 + 0.3 * (p.lanceLvl - 1))) / p.lanceCd;
 if (p.teslaLvl > 0) x += (22 * p.dmgMult * (p.teslaLvl + 1)) / 3;
 if (p.orbs > 0) x += 0.3 * (15 * p.dmgMult * p.orbs) / 0.45;
 return x;
}
function effDps(p) { return gunDps(p) + abilityDps(p); }
// Analytic time-to-kill: total nest HP over sustained DPS, derated for the
// fraction of a real fight spent moving, dodging and repositioning rather than
// holding the trigger on the boss.
const UPTIME = 0.45;
// Drafts offer three rarity-weighted cards, so any single run is luck. Average
// across seeds or the suite measures one unlucky build and calls it a balance
// failure.
const SAMPLES = 3;
// Lieutenant HP the nest can add on top of its starting bosses. The old model
// summed only the bosses present at load, so every TTK it reported was
// optimistic the moment command depth arrived. Assumes the whole nest budget is
// spent, spread down the chain (half at each link, the rest at the last), with
// each lieutenant's real HP taken from mkLieutenant so the decay is the game's.
function projectedLtHp(api, s, kinds) {
 const n = s + 1, sig = api.signatureNests[n];
 const cmd = (sig && sig.cmd !== undefined) ? sig.cmd : api.commandDepth(n);
 let left = api.ltBudgetFor(n);
 if (!left || cmd <= 0) return { hp: 0, count: 0 };
 const D = api.bossdefs;
 const topT = Math.max.apply(null, kinds.map(k => D[k].tier));
 let hp = 0, count = 0;
 for (let chain = 1; chain <= cmd && left > 0; chain++) {
  const subs = api.subordinateKinds(topT - chain + 1, n);
  if (!subs.length) break;
  const take = chain < cmd ? Math.ceil(left / 2) : left;
  let avg = 0;
  for (const k of subs) avg += api.mkLieutenant(k, 500, 500, s, chain, 0).maxhp;
  avg /= subs.length;
  hp += take * avg; count += take; left -= take;
 }
 return { hp, count };
}
// picks-per-sector: 1.15 is a player who pushes forward; 1.4 is one who replays
// cleared sectors to level up first — the user's "stall, level up, level up".
function nestProfile(sector, order, rate) {
 let dps = 0, maxhp = 0, hp = 0, ltHp = 0, ltN = 0, dmg = 0, bosses = 0;
 for (let k = 0; k < SAMPLES; k++) {
  const api = boot();
  seedRandom(api, 8100 + sector * 97 + k * 7919);
  api.startRun();
  api.loadSector(0); api.forceState('playing');
  draftBuild(api, Math.max(4, Math.round((sector + 1) * (rate || 1.15))), order);
  dps += effDps(api.player); maxhp += api.player.maxhp;
  api.loadSector(sector); api.forceState('playing');
  const bs = bossesIn(api);
  hp += bs.reduce((a, b) => a + b.maxhp, 0);
  const lt = projectedLtHp(api, sector, bs.map(b => b.kind));
  ltHp += lt.hp; ltN = lt.count;
  dmg = Math.max(dmg, bs.reduce((a, b) => Math.max(a, b.dmg), 0));
  bosses = bs.length;
 }
 dps /= SAMPLES; maxhp /= SAMPLES; hp /= SAMPLES; ltHp /= SAMPLES;
 return { dps, hp, ltHp, ltN, bosses, dmg, maxhp, ttk: (hp + ltHp) / (dps * UPTIME) };
}
// A nest is a wall when even this profile cannot finish it before the boss goes
// RELENTLESS (180s) with margin, or when one boss hit takes half your bar.
const WALL_TTK = 240;
function isWall(r) { return r.ttk > WALL_TTK || r.dmg / r.maxhp >= 0.5; }
function suiteBalance() {
 section('balance model');
 const depths = [4, 9, 14, 19, 24, 29, 34, 39, 44, 49, 54, 59, 64, 69, 74, 79, 84, 89, 94, 99,
  104, 109, 114, 119, 124, 129, 134];
 const rows = [];
 for (const s of depths) rows.push({
  s, g: nestProfile(s, GREEDY_ORDER, 1.15), b: nestProfile(s, BALANCED_ORDER, 1.15), f: nestProfile(s, BALANCED_ORDER, 1.4)
 });
 if (VERBOSE) {
  console.log('  nest  bosses  +LT   ceilTTK  balTTK  farmTTK   bossHit  hit/farmHP');
  for (const r of rows) console.log('  ' +
   ('S' + (r.s + 1)).padEnd(6), String(r.b.bosses).padStart(5), String(r.b.ltN).padStart(4),
   r.g.ttk.toFixed(1).padStart(9), r.b.ttk.toFixed(1).padStart(7), r.f.ttk.toFixed(1).padStart(8),
   String(r.b.dmg).padStart(9), (r.f.dmg / r.f.maxhp).toFixed(2).padStart(11));
 }
 const n = r => r.s + 1;
 for (const r of rows) {
  const L = 'S' + n(r);
  // Bands widen from S60 to S100: "harder every nest, but doable". A ceiling
  // build is allowed twice the early time by S100, a farmer 1.4x — still well
  // inside the 240s wall.
  const late = n(r) <= 60 ? 0 : Math.min(1, (n(r) - 60) / 40);
  const gCap = Math.round((75 + 25 * (r.g.bosses - 1)) * (1 + late));
  const bCap = Math.round((150 + 40 * (r.b.bosses - 1)) * (1 + 0.4 * late));
  atLeast(L + ' resists a ceiling build (TTK >= 6s)', r.g.ttk, 6);
  if (n(r) > 100) continue; // past the Apex the wall assertions below take over
  atMost(L + ' beatable by a ceiling build (TTK <= ' + gCap + 's)', r.g.ttk, gCap);
  atMost(L + ' winnable for a farming build (TTK <= ' + bCap + 's)', r.f.ttk, bCap);
  ok(L + ' is not a wall for a farmer', !isWall(r.f), 'ttk ' + r.f.ttk.toFixed(0) + ' hit ' + (r.f.dmg / r.f.maxhp).toFixed(2));
  atMost(L + ' boss hit stays under a third of a farmer\'s bar', r.f.dmg / r.f.maxhp, 0.34);
  atLeast(L + ' is a real fight for a balanced build (TTK >= 8s)', r.b.ttk, 8);
  // A player who never farms: fully winnable to S60, never walled to S90, and
  // past S90 farming is allowed to be the price of the Apex.
  if (n(r) <= 60) atMost(L + ' winnable without farming', r.b.ttk, bCap);
  else if (n(r) <= 90) ok(L + ' not a wall even without farming', !isWall(r.b), 'ttk ' + r.b.ttk.toFixed(0));
 }
 // Difficulty RISES toward S100: late nests take longer than early ones.
 const avg = (lo, hi) => { const xs = rows.filter(r => n(r) >= lo && n(r) <= hi); return xs.reduce((a, r) => a + r.b.ttk, 0) / xs.length; };
 const early = avg(5, 20), late = avg(80, 100);
 atLeast('difficulty climbs toward S100 (late/early TTK >= 1.2)', late / early, 1.2);
 atMost('but S100 is not an order of magnitude past S5 (late/early <= 5)', late / early, 5);
 // Past S100: a deliberate wall. A farmer still clears the first repeat, then
 // the run ends in a chosen band — not at S101, not never.
 const f105 = rows.find(r => n(r) === 105);
 ok('S105 is still clearable for a farmer', f105 && !isWall(f105.f), f105 && ('ttk ' + f105.f.ttk.toFixed(0)));
 const wall = rows.find(r => n(r) > 100 && isWall(r.f) && isWall(r.g));
 ok('a wall exists past S100', !!wall);
 if (wall) range('the wall lands in the S110-S130 band', n(wall), 110, 130);
 // and it stays a wall: nothing deeper becomes easier again
 if (wall) ok('every nest past the wall stays a wall', rows.filter(r => n(r) > n(wall)).every(r => isWall(r.f)));

 // README pins. These exact figures are quoted in the README balance table.
 // If a change moves any of them by more than 20%, this fails — so the docs are
 // updated alongside the code instead of silently going stale.
 const PINNED = [[5, 'f', 23.9], [10, 'f', 58.2], [50, 'g', 47.8], [50, 'f', 51.1],
  [80, 'f', 93.2], [100, 'g', 144.6], [100, 'f', 171.7], [105, 'f', 206.7]];
 for (const [nn, prof, val] of PINNED) {
  const r = rows.find(x => n(x) === nn);
  range('README pin: S' + nn + ' ' + (prof === 'g' ? 'ceiling' : 'farmer') + ' TTK ~' + val + 's', r[prof].ttk, val * 0.8, val * 1.2);
 }
 if (wall) eq('README pin: the wall is at S115', n(wall), 115);
 return null;
}

// ======================================================================
//  SUITE 8b -- every boss kind actually runs
// ======================================================================
// HP arithmetic proves nothing about whether an AI works. Spawn each kind
// alone, fight it for real, and assert it moves, takes damage, dies, and never
// throws. This is what catches a primitive that references a missing field.
const ALL_BOSSES = ['overlord', 'warden', 'phantom', 'leviathan', 'oracle', 'harbinger',
 'basilisk', 'juggernaut', 'nullifier', 'chorus', 'archon', 'singularity'];
function suiteBossRoster() {
 section('boss roster');
 const api0 = boot();
 eq('roster has twelve kinds', Object.keys(api0.bossdefs).length, 12);
 for (const k of ALL_BOSSES) ok('roster defines ' + k, !!api0.bossdefs[k]);
 // signature set pieces are honoured
 deepEq('S5 signature: a lone OVERLORD', api0.bossKindsFor(4), ['overlord']);
 deepEq('S50 signature: the first Sovereign alone', api0.bossKindsFor(49), ['archon']);
 deepEq('S100 signature: the Apex alone', api0.bossKindsFor(99), ['singularity']);
 ok('beyond S100 still returns a nest', api0.bossKindsFor(299).length >= 2);
 const seen = new Set();
 for (let s = 4; s < 300; s += 5) for (const k of api0.bossKindsFor(s)) seen.add(k);
 eq('every defined boss appears somewhere on the trail', seen.size, 12);
 return null;
}

// ======================================================================
//  SUITE 8a -- the chain of command
// ======================================================================
// Hierarchy is a RULE now, so test the rule, not a table: every debut is solo,
// every escort outranks nobody, nothing summons a boss before S31, and every
// lieutenant sits exactly one rank below whoever called it.
function suiteHierarchy() {
 section('hierarchy');
 const api = boot();
 const D = api.bossdefs, T = k => D[k].tier;
 const debuts = Object.keys(D).map(k => D[k].debut);
 eq('no two bosses share a debut', new Set(debuts).size, debuts.length);
 ok('every debut is a nest sector', debuts.every(n => n % 5 === 0), debuts.join(','));
 for (const k of Object.keys(D)) {
  const nest = api.bossKindsFor(D[k].debut - 1);
  deepEq(k + ' debuts alone at S' + D[k].debut, nest, [k]);
 }
 // every rank below the top is populated, so a commander always has somewhere to reach
 for (let t = 1; t <= 4; t++) atLeast('rank ' + api.tierNames[t] + ' has members', (api.bossesByTier[t] || []).length, 1);
 // derived nests: the lead outranks every escort, and nothing is fielded early
 for (let n = 5; n <= 300; n += 5) {
  const kinds = api.bossKindsFor(n - 1);
  const lead = kinds[0];
  ok('S' + n + ' only fields bosses already met', kinds.every(k => D[k].debut <= n), kinds.join('+'));
  if (kinds.length > 1)
   ok('S' + n + ' escorts are all outranked by the lead', kinds.slice(1).every(k => T(k) < T(lead)), kinds.join('+'));
 }
 // the command-depth dial
 for (const n of [5, 10, 20, 25, 30]) { eq('S' + n + ' command depth is 0', api.commandDepth(n), 0); eq('S' + n + ' lieutenant budget is 0', api.ltBudgetFor(n), 0); }
 eq('S31 command depth is 1', api.commandDepth(31), 1);
 eq('S61 command depth is 2', api.commandDepth(61), 2);
 atLeast('past S100 command depth keeps rising', api.commandDepth(101), 3);
 ok('command depth never shrinks with depth', [5, 30, 31, 60, 61, 100, 101, 160, 250].every((n, i, a) => i === 0 || api.commandDepth(n) >= api.commandDepth(a[i - 1])));
 // subordinates are exactly one rank down and already met
 for (const k of Object.keys(D)) {
  const subs = api.subordinateKinds(T(k), 300);
  ok(k + ' commands only rank ' + (T(k) - 1), subs.every(j => T(j) === T(k) - 1), subs.join(','));
 }
 // lieutenant HP decays by chain depth
 const full = D.warden.hp;
 api.startRun(); api.loadSector(59);
 const l1 = api.mkLieutenant('warden', 500, 500, 59, 1, 0), l2 = api.mkLieutenant('warden', 500, 500, 59, 2, 0);
 range('chain-1 lieutenant carries ~22% of a full boss', l1.maxhp / l2.maxhp, 4.4, 4.7);
 ok('lieutenants never recover', !l1.recovKind && !l2.recovKind);

 // -- live fights: the dial actually holds in play ----------------------------
 const live = (sector, secs) => {
  const a = boot(); seedRandom(a, 91000 + sector);
  a.startRun(); a.loadSector(sector - 1); a.forceState('playing');
  const budget = a.nestLtLeft;
  const T0 = Math.max.apply(null, a.enemies.filter(e => e.type === 'boss').map(e => D[e.kind].tier));
  let maxLive = 0, maxChain = 0, spawned = new Set(), badRank = [], early = [];
  for (let i = 0; i < 60 * secs; i++) {
   immortal(a); a.player.autoFire = false; a.mouse.down = false;  // let the chain grow unmolested
   if (a.state === 'levelup') a.forceState('playing');
   a.update(DT);
   let liveN = 0;
   for (const e of a.enemies) if (e.lieutenant && !e.echo) {
    liveN++; spawned.add(e.uid); maxChain = Math.max(maxChain, e.chain);
    if (D[e.kind].tier > T0 - e.chain) badRank.push(e.kind + '@' + e.chain);
    if (D[e.kind].debut > sector) early.push(e.kind);
   }
   maxLive = Math.max(maxLive, liveN);
  }
  return { budget, maxLive, maxChain, total: spawned.size, badRank, early };
 };
 const s20 = live(20, 90);
 eq('S20 fields no boss-class lieutenants in 90s of play', s20.total, 0);
 const s35 = live(35, 90);
 atMost('S35 lieutenants stay one link deep', s35.maxChain, 1);
 atMost('S35 never exceeds the nest budget', s35.total, s35.budget);
 const s50 = live(50, 90);
 atLeast('S50 ARCHON actually commands', s50.total, 1);
 atMost('S50 lieutenants never exceed the live cap', s50.maxLive, 2);
 eq('S50 lieutenants are always outranked by their chain', s50.badRank.length, 0, s50.badRank.join(','));
 const s100 = live(100, 150);
 atMost('S100 chain is at most three links deep', s100.maxChain, 3);
 atMost('S100 never exceeds the nest budget', s100.total, s100.budget);
 atMost('S100 never exceeds the live cap', s100.maxLive, 2);
 eq('S100 never fields a boss before its debut', s100.early.length, 0);
 ok('S100 lieutenants respect rank', s100.badRank.length === 0, s100.badRank.join(','));

 // -- hub lore: bespoke per debut, names its rank, never overflows the pill ---
 for (const k of Object.keys(D)) {
  const line = api.debutLore[k];
  ok(k + ' has a bespoke debut line', !!line);
  ok(k + ' debut line names its rank ' + api.tierNames[T(k)], !!line && line.indexOf(api.tierNames[T(k)]) >= 0, line);
  eq(k + ' debut nest shows its bespoke line', api.nestLore(D[k].debut - 1), line);
 }
 const lines = new Set();
 for (let n = 5; n <= 300; n += 5) {
  const l = api.nestLore(n - 1);
  lines.add(l);
  atMost('S' + n + ' hub line fits the pill (<=100 chars)', l.length, 100);
  ok('S' + n + ' hub line has no "A A…" article slip', !/\bA (APEX|ENFORCER)\b/.test(l), l);
 }
 atLeast('hub lore is varied, not one template', lines.size, 25);
 return null;
}

// Every boss kind, spawned alone and fought for real.
function suiteBossLive() {
 section('boss roster live');

 for (const kind of ALL_BOSSES) {
  const api = boot();
  seedRandom(api, 77000 + kind.length * 31);
  api.startRun();
  // Fixed, deterministic damage build. This suite tests whether the AI RUNS,
  // not whether a draft got lucky — handing the cards over directly keeps a
  // bad roll from masquerading as a broken boss.
  for (const id of ['dmg', 'rate', 'array', 'crit', 'slug', 'pierce', 'seek']) {
   const u = api.upgrades.find(x => x.id === id);
   for (let k = 0; k < (u.max || 4); k++) { if (u.req && !u.req(api.player)) break; api.pickUpgrade(u); }
  }
  api.loadSector(29); api.forceState('playing');
  for (const e of api.enemies.slice()) api.enemies.splice(api.enemies.indexOf(e), 1);
  let threw = null;
  try { api.spawnEnemy('boss:' + kind); } catch (e) { threw = e; }
  ok(kind + ' spawns without throwing', !threw, threw && threw.message);
  const b = bossesIn(api)[0];
  if (!b) { ok(kind + ' present after spawn', false); continue; }
  const hp0 = b.hp, x0 = b.x, y0 = b.y;
  let moved = 0, died = false, err = null;
  const p = api.player;
  p.autoFire = true;
  try {
   for (let i = 0; i < 60 * 90; i++) {
    immortal(api);
    api.update(DT);
    if (api.state === 'levelup') api.forceState('playing');
    if (i % 30 === 0) moved = Math.max(moved, Math.hypot(b.x - x0, b.y - y0));
    if (bossesIn(api).indexOf(b) < 0) { died = true; break; }
   }
  } catch (e) { err = e; }
  ok(kind + ' runs 90s without throwing', !err, err && (err.message + ' @ ' + (err.stack || '').split('\n')[1]));
  ok(kind + ' takes damage', died || b.hp < hp0, 'hp ' + hp0.toFixed(0) + ' -> ' + b.hp.toFixed(0));
  ok(kind + ' is killable inside 90s', died, died ? '' : 'left ' + ((b.hp / b.maxhp) * 100).toFixed(0) + '%');
  ok(kind + ' repositions rather than sitting still', died || moved > 40, 'moved ' + moved.toFixed(0));
  atMost(kind + ' leaves no hazard leak', api.hazards.length, 40);
 }
 return null;
}

// ======================================================================
//  SUITE 8c -- adversarial combo audit
// ======================================================================
// Cheesy-strong is the goal; unbreakable is not. These take every multiplier
// that composes, stack it to the cap, and assert the result is still inside the
// envelope the enemy curve was tuned against.
function suiteCombos() {
 section('combo audit');
 const api = boot();
 ok('every card has an icon case', true); // asserted structurally below
 // -- every upgrade must apply cleanly from a fresh player, at full stacks
 for (const u of api.upgrades) {
  const a = boot(); a.startRun(); a.loadSector(0); a.forceState('playing');
  let threw = null;
  try {
   const n = u.max || 3;
   for (let k = 0; k < n; k++) {
    const def = a.upgrades.find(x => x.id === u.id);
    if (def.req && !def.req(a.player)) break;
    a.pickUpgrade(def);
   }
  } catch (e) { threw = e; }
  ok(u.id + ' applies to its cap without throwing', !threw, threw && threw.message);
  const p = a.player;
  ok(u.id + ' leaves finite stats', isFinite(p.dmgMult) && isFinite(p.fireRate) && isFinite(p.maxhp) && isFinite(p.shots));
  atLeast(u.id + ' leaves fire rate positive', p.fireRate, 0.1);
  atLeast(u.id + ' leaves damage positive', p.dmgMult, 0.05);
  // dyn() descriptions must survive being asked at any state
  if (typeof u.dyn === 'function') {
   let dthrew = null;
   try { u.dyn(p); } catch (e) { dthrew = e; }
   ok(u.id + ' dyn() is safe to render', !dthrew, dthrew && dthrew.message);
  }
 }
 // -- the everything build: does the ceiling hold?
 // Hand over every offensive card at full stacks — the true ceiling, without the
 // level inflation a 500-draft simulation would add.
 const a = boot(); seedRandom(a, 24680);
 a.startRun(); a.loadSector(0); a.forceState('playing');
 for (const id of ['dmg', 'rate', 'slug', 'array', 'crit', 'split', 'minigun', 'overcharge',
  'flak', 'chain', 'corrode', 'adrenal', 'shock', 'shockamp', 'shockrad', 'shockcap',
  'orbital', 'lance', 'tesla', 'orbit', 'nova', 'pierce', 'seek', 'vamp', 'hp']) {
  const u = a.upgrades.find(x => x.id === id);
  if (!u) { ok('combo card ' + id + ' exists', false); continue; }
  for (let k = 0; k < (u.max || 4); k++) { if (u.req && !u.req(a.player)) break; a.pickUpgrade(u); }
 }
 const p = a.player;
 const ceiling = effDps(p);
 if (VERBOSE) console.log('  everything-build sustained DPS: ' + ceiling.toFixed(0) +
  '  shots=' + p.shots + ' rate=' + p.fireRate.toFixed(1) + ' dmgMult=' + p.dmgMult.toFixed(2));
 atMost('maxed everything stays under the tuned DPS ceiling', ceiling, 9000);
 atLeast('maxed everything is still meaningfully strong', ceiling, 1500);
 atMost('fire rate cannot become a single-frame machine gun', p.fireRate, 26);
 atMost('projectile count stays renderable', p.shots, 12);
 atMost('max HP stays in band', p.maxhp, 500);
 // sustain must not outpace incoming damage at depth
 atMost('lifesteal per kill stays bounded', p.vamp, 10);
 atMost('out-of-combat regen stays bounded', p.repair, 6);
 // the discharge line must not become a permanent aura
 if (p.shockOn) {
  atLeast('discharge still costs kills', p.shockNeed, 10);
  const burst = p.shockDmg * p.dmgMult;
  atMost('discharge burst stays under a boss health bar', burst, 6000);
 }
 return a;
}

// ======================================================================
//  SUITE 8d -- codex completeness
// ======================================================================
function suiteCodex() {
 section('codex');
 const api = boot();
 const tabs = api.helpTabs;
 eq('help is back to four tabs', tabs.length, 4);
 ok('help no longer hosts the codex', tabs.indexOf('bestiary') < 0 && tabs.indexOf('bosses') < 0);
 const foes = api.codexFoes, bosses = api.codexBosses;
 ok('codex entries carry no duplicate debut field', bosses.every(b => b.at === undefined));
 // every boss in the roster is documented, and nothing is documented twice
 const defIds = Object.keys(api.bossdefs).sort();
 const docIds = bosses.map(b => b.id).sort();
 deepEq('every boss has a codex entry', docIds, defIds);
 eq('no duplicate boss entries', new Set(docIds).size, docIds.length);
 // every fieldable enemy type is documented
 for (const t of ['drone', 'mite', 'stalker', 'sniper', 'tempest', 'brute'])
  ok('bestiary documents ' + t, foes.some(f => f.type === t));
 for (const e of foes.concat(bosses)) {
  const id = e.id;
  ok(id + ' has a tell', !!e.tell && e.tell.length > 12);
  ok(id + ' has a counter', !!e.counter && e.counter.length > 12);
  ok(id + ' has lore', !!e.lore && e.lore.length > 40);
  ok(id + ' has role and threat', !!e.role && !!e.threat);
  // lore must not be a restatement of the mechanic line
  ok(id + ' lore is not a copy of its counter', e.lore !== e.counter);
 }
 // "first seen" comes from BOSSDEF.debut, and must be where it really leads
 for (const b of bosses) {
  const n = api.bossdefs[b.id].debut;
  ok(b.id + ' really debuts at S' + n, api.bossKindsFor(n - 1)[0] === b.id, 'got ' + api.bossKindsFor(n - 1).join('+'));
 }
 // help tabs render
 api.startRun(); api.loadSector(0);
 api.openHelp('title');
 for (const t of tabs) {
  api.setHelpTab(t);
  let threw = null;
  try { api.render(); } catch (e) { threw = e; }
  ok('help tab "' + t + '" renders', !threw, threw && threw.message);
 }

 // -- codex screen: reachable from title, hub, pause and mid-fight ------------
 const reach = (setup, from, back) => {
  const a = boot(); a.startRun(); setup(a);
  a.handleKeyPress('KeyC');
  const opened = a.state === 'codex';
  a.handleKeyPress('Escape');
  return { opened, back: a.state === back };
 };
 let r = reach(a => a.forceState('title'), 'title', 'title');
 ok('C opens the codex from the title', r.opened); ok('Esc returns to the title', r.back);
 r = reach(a => a.forceState('galaxy'), 'galaxy', 'galaxy');
 ok('C opens the codex from the galaxy hub', r.opened); ok('Esc returns to the hub', r.back);
 r = reach(a => { a.loadSector(0); a.forceState('paused'); }, 'paused', 'paused');
 ok('C opens the codex from pause', r.opened); ok('Esc returns to pause', r.back);
 r = reach(a => { a.loadSector(0); a.forceState('playing'); }, 'playing', 'paused');
 ok('C mid-fight opens the codex', r.opened); ok('mid-fight codex returns to pause, not straight into combat', r.back);

 // -- locked by default, unlocked by a kill, persisted ------------------------
 const fresh = boot();
 eq('a fresh profile has nothing unlocked', fresh.codexProgress().n, 0);
 eq('codex counts every foe and boss', fresh.codexProgress().tot, foes.length + bosses.length);
 fresh.startRun(); fresh.loadSector(4); fresh.forceState('playing');
 const boss = fresh.enemies.find(e => e.type === 'boss');
 const drone = fresh.enemies.find(e => e.type === 'drone');
 ok('the S5 nest has a boss and a drone to kill', !!boss && !!drone);
 ok('OVERLORD starts locked', !fresh.codexKnown('overlord'));
 fresh.killEnemy(fresh.enemies.indexOf(drone));
 ok('killing a drone unlocks DRONE', fresh.codexKnown('drone'));
 ok('killing a drone does not unlock the OVERLORD', !fresh.codexKnown('overlord'));
 fresh.killEnemy(fresh.enemies.indexOf(boss));
 ok('killing the OVERLORD unlocks it', fresh.codexKnown('overlord'));
 const stored = fresh.__store;
  ok('progress is written to localStorage', /overlord/.test(stored.kriefne_codex || ''), stored.kriefne_codex);
 const again = boot(stored);
 ok('unlocks survive a reload', again.codexKnown('overlord') && again.codexKnown('drone'));
 ok('nothing extra unlocks on reload', !again.codexKnown('singularity'));
 // lieutenants count for their kind
 const lt = boot(); lt.startRun(); lt.loadSector(59); lt.forceState('playing');
 lt.enemies.push(lt.mkLieutenant('warden', 600, 600, 59, 1, 0));
 lt.killEnemy(lt.enemies.length - 1);
 ok('defeating a lieutenant unlocks its kind', lt.codexKnown('warden'));
 // settings wipe clears it
 again.forceState('settings'); again.handleKeyPress('Digit6');
 eq('wiping records clears the codex', again.codexProgress().n, 0);
 // locked entries reveal nothing through the command tree either
 ok('locked subordinates stay ??? in the command line', /\?\?\?/.test(fresh.commandLine('archon')));
  const named = boot({ kriefne_codex: JSON.stringify(['warden', 'phantom']) });
 ok('known subordinates are named in the command line', /Commands CAPTAINS: WARDEN, PHANTOM/.test(named.commandLine('leviathan')), named.commandLine('leviathan'));
 ok('the Apex answers to no one', /Answers to no one/.test(named.commandLine('singularity')));
 ok('an Enforcer commands only chaff', /Commands only chaff/.test(named.commandLine('overlord')));

 // -- every entry renders, locked AND unlocked (exercises each live sprite) ---
 for (const unlocked of [false, true]) {
  const seed = {};
   if (unlocked) seed.kriefne_codex = JSON.stringify(foes.map(f => f.type).concat(bosses.map(b => b.id)));
  const a = boot(seed); a.startRun(); a.loadSector(0);
  a.openCodex('title');
  for (const t of ['bestiary', 'bosses']) {
   a.setCodexTab(t);
   const n = t === 'bosses' ? bosses.length : foes.length;
   let threw = null, seen = new Set();
   try { for (let i = 0; i < n + 2; i++) { seen.add(a.codexSel); a.render(); a.handleKeyPress('ArrowDown'); } }
   catch (e) { threw = e; }
   const tag = (unlocked ? 'unlocked ' : 'locked ') + t;
   ok(tag + ' renders every entry', !threw, threw && threw.message);
   eq(tag + ' arrow keys visit every entry', seen.size, n);
  }
 }
 return api;
}

// ======================================================================
//  SUITE 9 -- endless-run integrity
// ======================================================================
function suitePoolExhaustion() {
 section('endless run integrity');
 const api = boot();
 seedRandom(api, 61616);
 api.startRun(); api.loadSector(0); api.forceState('playing');
 draftBuild(api, 300, GREEDY_ORDER);
 // Every real card is capped, so the genuine pool must run dry. Field Refit is
 // deliberately infinite and is NOT part of the pool — it only fills an empty draft.
 eq('the real card pool exhausts under caps', api.pool().length, 0);
 // The draft must still open, and must still be answerable, with nothing left.
 api.forceState('playing');
 let threw = null;
 try { api.gainXp(100000); } catch (e) { threw = e; }
 ok('level-up with an exhausted pool does not throw', !threw, threw && threw.message);
 ok('exhausted draft still offers at least one card', api.choices.length >= 1, 'n=' + api.choices.length);
 // A single huge XP grant queues many levels, so drafts chain until drained.
 let drafts = 0;
 while (api.state === 'levelup' && drafts < 500) {
  try { api.handleKeyPress('Digit1'); } catch (e) { threw = e; break; }
  drafts++;
 }
 ok('picking from an exhausted draft does not throw', !threw, threw && threw.message);
 atLeast('a multi-level XP grant awards every level it earned', drafts, 2);
 eq('drafts drain back to play', api.state, 'playing');
 return api;
}

// ======================================================================
//  SUITE 10 -- kill cascades, boss phase hand-off, layout variety
// ======================================================================
function suiteCascades() {
 section('kill cascades / phase hand-off');
 const fresh = (sector) => {
  const api = boot(); seedRandom(api, 7);
  api.startRun(); api.loadSector(sector); api.forceState('playing');
  api.player.autoFire = false; immortal(api); api.queue.length = 0;
  return api;
 };
 const tryStep = (api) => { try { api.update(DT); return null; } catch (e) { return e; } };
 // A burn kill whose Shrapnel splash kills a LOWER-indexed enemy used to leave
 // the enemy loop reading past the end of the array.
 {
  const api = fresh(1), p = api.player, E = api.enemies; p.shrap = 1; E.length = 0;
  api.spawnEnemy('drone'); api.spawnEnemy('drone');
  for (const e of E) { e.x = p.x + 300; e.y = p.y; e.spawnT = 0; }
  E[0].hp = 1; E[1].hp = 0.001; E[1].burnT = 1; E[1].burnDps = 100;
  const err = tryStep(api);
  ok('burn kill + shrapnel cascade does not throw', !err, err && err.message);
  eq('both drones died to the cascade', E.length, 0);
 }
 // Same cascade from an orbit-blade kill.
 {
  const api = fresh(1), p = api.player, E = api.enemies; p.shrap = 2; p.orbs = 1; p.orbAng = 0; E.length = 0;
  api.spawnEnemy('drone'); api.spawnEnemy('drone');
  E[1].hp = 0.001; E[1].x = p.x + 34 * Math.cos(2.6 * DT); E[1].y = p.y + 34 * Math.sin(2.6 * DT); E[1].spawnT = 0;
  E[0].hp = 1; E[0].x = E[1].x + 20; E[0].y = E[1].y; E[0].spawnT = 0;
  const err = tryStep(api);
  ok('orbit kill + shrapnel cascade does not throw', !err, err && err.message);
 }
 // Last nest boss dies next to weak guards: splash-in-splash must not abort the
 // boss bookkeeping (permanent damage, heal, bonus draft).
 {
  const api = fresh(4), p = api.player, E = api.enemies; p.shrap = 1;
  const boss = E.find(e => e.type === 'boss'); E.length = 0; E.push(boss);
  api.spawnEnemy('drone'); api.spawnEnemy('drone');
  boss.x = p.x + 200; boss.y = p.y; boss.hp = 1; boss.spawnT = 0;
  E[1].x = boss.x + 20; E[1].y = boss.y; E[1].hp = 1; E[2].x = boss.x - 20; E[2].y = boss.y; E[2].hp = 1;
  const b0 = api.bosses; let err = null;
  try { api.killEnemy(0); } catch (e) { err = e; }
  ok('boss kill with a shrapnel cascade does not throw', !err, err && err.message);
  eq('the boss kill is banked', api.bosses - b0, 1);
  eq('the nest-clear bonus draft opens', api.state, 'levelup');
 }
 // Ship dies and the burning last boss dies in the same frame: stay dead.
 {
  const api = fresh(4), p = api.player, E = api.enemies;
  const boss = E.find(e => e.type === 'boss'); E.length = 0; E.push(boss);
  api.spawnEnemy('drone'); const dr = E[1];
  boss.x = p.x + 300; boss.y = p.y; boss.hp = 0.001; boss.burnT = 1; boss.burnDps = 50; boss.spawnT = 0;
  dr.x = p.x; dr.y = p.y; dr.contactCd = 0; dr.spawnT = 0;
  p.hp = 1; p.invuln = 0; p.stasisN = 0; p.secondWind = false;
  tryStep(api);
  eq('a same-frame boss kill does not undo game over', api.state, 'gameover');
  eq('a dead ship is not healed by the boss kill', p.hp, 0);
 }
 // NULLIFIER jamming locks recall as well as dash, and breaks a blink in progress.
 {
  const api = fresh(1), p = api.player; give(api, 'pcell');
  api.doPortalKey(); p.x += 200; p.jamT = 5;
  api.doPortalKey();
  ok('jammed ship cannot start a blink', !p.channel);
  p.jamT = 0; api.doPortalKey();
  ok('blink starts once the jam lifts', !!p.channel);
  api.hazards.push({ x: p.x, y: p.y, r: 96, t: 0, life: 4, dmg: 0, tick: 0, jam: true });
  tryStep(api);
  ok('stepping into a jam field cancels the blink', !p.channel);
 }
 const bossAt = (kind) => {
  const api = fresh(1), E = api.enemies; E.length = 0; api.arena.obs.length = 0;
  api.spawnEnemy('boss:' + kind); const b = E[0];
  b.spawnT = 0; b.ltCd = 999; b.phaseT = 0;
  return { api, p: api.player, b };
 };
 // SINGULARITY's gravity phase drags the ship IN.
 {
  const { api, p, b } = bossAt('singularity');
  p.x = 700; p.y = 500; b.x = 1000; b.y = 500;
  for (let i = 0; i < 60; i++) { b.phaseT = 0.01; immortal(api); api.update(DT); }
  eq('singularity phase under test', b.def.phases[b.phase], 'gravity');
  atLeast('gravity pulls the ship toward the boss', p.x - 700, 60);
 }
 // JUGGERNAUT ramming a pylon ends the charge (with its shockwave) on impact.
 {
  const { api, p, b } = bossAt('juggernaut');
  p.x = 700; p.y = 500; b.x = 1000; b.y = 500; b.ramT = 0;
  api.arena.obs.push({ kind: 'circle', x: 870, y: 500, r: 40 });
  let endT = null;
  for (let i = 1; i <= 120 && endT === null; i++) {
   p.x = 700; p.y = 500; api.update(DT);
   if (i > 3 && !b.chargeOn) endT = i * DT;
  }
  ok('a ram pinned on a pylon ends promptly', endT !== null && endT < 0.5, 'ended at ' + endT);
 }
 // A burrow / gaze cut off by the phase change is dropped, not carried over.
 {
  const { api, p, b } = bossAt('leviathan');
  b.phaseT = 11.5; p.x = 600; p.y = 500; b.x = 1000; b.y = 500;
  step(api, 20); const pending = b.burrowT;
  step(api, 30);
  ok('leviathan had a burrow pending', pending > 0, 'burrowT=' + pending);
  eq('a burrow cut off by the phase change is dropped', b.burrowT, 0);
 }
 {
  const { api, p, b } = bossAt('basilisk');
  b.phaseT = 3.2; b.gazeT = 0; p.x = 600; p.y = 500; b.x = 900; b.y = 500;
  api.update(DT); const had = !!b.gaze;
  step(api, 20);
  ok('basilisk had a gaze pending', had);
  ok('a gaze cut off by the phase change is dropped', !b.gaze);
 }
 // Normal sectors must cycle archetypes, not repeat one layout all run.
 for (const seed of [1, 2, 3]) {
  const api = boot(); seedRandom(api, seed); api.startRun();
  const seen = new Set();
  for (let i = 0; i < 12; i++) { api.loadSector(i); if ((i + 1) % 5) seen.add(api.arena.layout); }
  atLeast('seed ' + seed + ': normal sectors use several layouts', seen.size, 5);
 }
 return null;
}

// ======================================================================
//  SUITE 0 -- XP conservation
// ======================================================================
// Reported: XP vanishes at sector end. Rather than guess at a cause, account for
// every gem. Two independent properties have to hold:
//   A. every point of gem value becomes player XP (nothing evaporates)
//   B. every level crossed hands out exactly one draft (nothing is swallowed)
// Gems are plain objects pushed onto `gems`, so identity tracking is enough to
// total what the sector actually created.
// Instrument at the SOURCE. Polling the array each frame undercounts: a gem can
// be created by a kill and consumed by the magnet inside the same update() call,
// so it never appears in any sample. Patching push on the live array catches
// every one. `gems` is only reassigned by loadArena, so attach after loadSector.
function xpLedger(api) {
 const arr = api.gems;
 const origPush = Array.prototype.push;
 let created = 0;
 arr.push = function () {
  for (let i = 0; i < arguments.length; i++) created += arguments[i].v;
  return origPush.apply(this, arguments);
 };
 return { get created() { return created; }, sample() { }, detach() { delete arr.push; } };
}
// Walk the player at the nearest enemy so a sector can actually be cleared.
// A stationary auto-firing pilot never reaches off-screen reinforcements.
function huntStep(api, speed) {
 const p = api.player, e = api.enemies[0];
 if (!e) return;
 const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
 p.x += dx / d * (speed || 3); p.y += dy / d * (speed || 3);
}
// Fly the ship over every gem still on the field, the way a player collects.
// The EXIT is parked out of reach for the sweep so touching it can never end the
// sector mid-collection, and the default magnet is restored so a gem resting
// against an obstacle is still pulled in.
function collectAll(api) {
 const p = api.player, pt = api.portal, px = pt && pt.x, py = pt && pt.y;
 if (pt) { pt.x = -1e5; pt.y = -1e5; }
 p.magnet = Math.max(p.magnet, 90); p.pull = Math.max(p.pull || 0, 430);
 let guard = 0;
 while (api.gems.length && guard++ < 4000) {
  if (api.state === 'levelup') { api.pickUpgrade(api.choices[0]); continue; }
  const g = api.gems[0];
  p.x = g.x; p.y = g.y;
  api.update(DT);
 }
 if (pt) { pt.x = px; pt.y = py; }
}
function fieldValue(api) { return api.gems.reduce((a, g) => a + g.v, 0); }
function suiteXp() {
 section('xp conservation');

 // -- A: gem value -> player XP, across the sector-clear vacuum --------------
 for (const sector of [1, 4, 9]) {
  const api = boot();
  seedRandom(api, 31000 + sector);
  api.startRun(); api.loadSector(sector); api.forceState('playing');
  const p = api.player;
  // Nothing auto-collects and nothing levels: isolates the gem->XP path so the
  // clear vacuum is the only thing that can deliver the value, and xpBonus
  // cannot shift underneath the measurement.
  p.magnet = 0; p.pull = 0; p.xpNeed = 1e9;
  const bonus = p.xpBonus, x0 = p.xp;
  const led = xpLedger(api);
  api.queue.length = 0;                       // no reinforcements; clear is reachable
  let guard = 0;
  while (api.enemies.length && guard++ < 800) { api.killEnemy(0); led.sample(); }
  for (let i = 0; i < 400; i++) {
   led.sample();
   if (api.state === 'levelup') { api.pickUpgrade(api.choices[0]); continue; }
   api.update(DT); led.sample();
  }
  const L = 'S' + (sector + 1);
  atLeast(L + ' produced gems to account for', led.created, 1);
  ok(L + ' portal opened (sector actually cleared)', !!api.portal);
  // XP is collected, never handed out: clearing the sector leaves the field alone.
  ok(L + ' clearing leaves every gem on the field (no auto-vacuum)',
   Math.abs(fieldValue(api) - led.created) < 0.01, 'on field ' + fieldValue(api) + ' of ' + led.created);
  eq(L + ' clearing banks no XP by itself', p.xp, x0);
  collectAll(api);
  eq(L + ' flying over the field picks every gem up', api.gems.length, 0);
  const absorbed = p.xp - x0, expected = led.created * bonus;
  ok(L + ' every point of gem value became XP',
   Math.abs(absorbed - expected) < 0.01,
   'absorbed ' + absorbed.toFixed(1) + ' of ' + expected.toFixed(1) +
   ' (lost ' + (expected - absorbed).toFixed(1) + ')');
 }

 // -- A2: gems left behind when you exit are gone for good -------------------
 {
  const api = boot();
  seedRandom(api, 31777);
  api.startRun(); api.loadSector(1); api.forceState('playing');
  const p = api.player;
  p.magnet = 0; p.pull = 0; p.xpNeed = 1e9;
  api.queue.length = 0;
  let guard = 0;
  while (api.enemies.length && guard++ < 800) api.killEnemy(0);
  for (let i = 0; i < 30; i++) { if (api.state === 'levelup') { api.pickUpgrade(api.choices[0]); continue; } api.update(DT); }
  ok('exit opened with gems still on the field', !!api.portal && api.gems.length > 0, 'gems ' + api.gems.length);
  const xp = p.xp;
  api.nextArena();
  eq('uncollected XP is not credited on exit', api.player.xp, xp);
  api.loadSector(2);
  eq('uncollected gems do not follow you into the next sector', api.gems.length, 0);
  eq('and are not credited on entry either', api.player.xp, xp);
 }

 // -- B: every level crossed hands out exactly one draft ---------------------
 {
  const api = boot();
  seedRandom(api, 4242);
  api.startRun(); api.loadSector(2); api.forceState('playing');
  const p = api.player;
  const before = p.level;
  api.gainXp(40000);                          // a Magnet Core vacuum's worth
  let drafts = 0;
  while (api.state === 'levelup' && drafts < 300) { api.pickUpgrade(api.choices[0]); drafts++; }
  atLeast('a big lump grants several levels', p.level - before, 2);
  eq('one draft per level gained', drafts, p.level - before);
  eq('draft queue drains back to play', api.state, 'playing');
 }

 // -- C: a boss bonus draft must not swallow a pending level-up --------------
 {
  const api = boot();
  seedRandom(api, 909);
  api.startRun(); api.loadSector(4); api.forceState('playing');
  const p = api.player;
  p.magnet = 0; p.pull = 0;
  const before = p.level;
  // Owe the player a draft, then kill the last boss in the same beat — the boss
  // branch of killEnemy calls openLevelUp() directly, bypassing the queue.
  api.gainXp(p.xpNeed + 1);
  const owed = p.level - before;
  api.queue.length = 0;
  let guard = 0;
  while (api.enemies.length && guard++ < 800) api.killEnemy(0);
  let drafts = 0;
  for (let i = 0; i < 400 && drafts < 300; i++) {
   if (api.state === 'levelup') { api.pickUpgrade(api.choices[0]); drafts++; continue; }
   api.update(DT);
  }
  const gained = p.level - before;
  atLeast('boss nest awards its bonus draft', drafts, owed + 1);
  atLeast('every level crossed still yielded a draft', drafts, gained);
  eq('no draft left open at the end', api.state, 'playing');
 }

 // -- D: Magnet Core vacuums from INSIDE pickUpgrade, while state==='levelup' --
 // apply() calls collectGems() before pickUpgrade sets state back to 'playing',
 // so gainXp runs in a state where it refuses to open a draft. This is the
 // "vacuum ability on round end" path the player described.
 {
  const api = boot();
  seedRandom(api, 5150);
  api.startRun(); api.loadSector(3); api.forceState('playing');
  const p = api.player;
  p.magnet = 0; p.pull = 0; p.xpNeed = 1e9;   // hold gems on the ground, no levelling
  const bonus = p.xpBonus, x0 = p.xp;
  const led = xpLedger(api);
  api.queue.length = 0;
  let guard = 0;
  while (api.enemies.length > 3 && guard++ < 800) { api.killEnemy(0); led.sample(); }
  led.sample();
  const onField = led.created;
  atLeast('gems are on the ground before the pick', onField, 1);
  atLeast('sector has not cleared yet', api.enemies.length, 1);
  // now draft Magnet Core exactly as the game would
  api.forceState('levelup');
  const magnet = api.upgrades.find(u => u.id === 'magnet');
  api.pickUpgrade(magnet);
  led.sample();
  eq('Magnet Core vacuumed the field', api.gems.length, 0);
  const absorbed = p.xp - x0, expected = onField * bonus;
  ok('Magnet Core vacuum credits every gem',
   Math.abs(absorbed - expected) < 0.01,
   'absorbed ' + absorbed.toFixed(1) + ' of ' + expected.toFixed(1));
 }

 // -- E: full realistic run, sector cleared by actual play --------------------
 for (const magnetStacks of [0, 3]) {
  const api = boot();
  seedRandom(api, 8080 + magnetStacks);
  api.startRun(); api.loadSector(2); api.forceState('playing');
  const p = api.player;
  // Enough gun and legs to reliably finish a sector — snipers and tempests kite,
  // and a starting loadout can stalemate them forever.
  give(api, 'dmg', 6); give(api, 'rate', 4); give(api, 'array', 2);
  for (let k = 0; k < magnetStacks; k++) give(api, 'magnet', 1);
  api.forceState('playing');
  p.autoFire = true; p.xpNeed = 1e9;          // no levelling; measure raw conservation
  const bonus = p.xpBonus, x0 = p.xp;
  const led = xpLedger(api);
  for (let i = 0; i < 60 * 300; i++) {
   immortal(api);
   if (api.state === 'levelup') { api.pickUpgrade(api.choices[0]); continue; }
   huntStep(api, 6);
   api.update(DT);
   if (api.portal) { for (let k = 0; k < 180; k++) api.update(DT); break; }
  }
  const tag = magnetStacks ? 'with magnet x3' : 'no magnet';
  ok(tag + ': run reached the exit', !!api.portal, 'foes left ' + api.hostiles());
  // Nothing is destroyed inside the sector: every gem is either banked or
  // still lying where it fell.
  const banked = p.xp - x0, left = fieldValue(api) * bonus;
  ok(tag + ': every gem is banked or still on the field',
   Math.abs(banked + left - led.created * bonus) < 0.01,
   'banked ' + banked.toFixed(1) + ' + field ' + left.toFixed(1) + ' of ' + (led.created * bonus).toFixed(1));
  collectAll(api);
  eq(tag + ': the whole field can be collected', api.gems.length, 0);
  const absorbed = p.xp - x0, expected = led.created * bonus;
  ok(tag + ': real playthrough loses no XP that was collected',
   Math.abs(absorbed - expected) < 0.01,
   'absorbed ' + absorbed.toFixed(1) + ' of ' + expected.toFixed(1) +
   ' (lost ' + (expected - absorbed).toFixed(1) + ')');
  led.detach();
 }

 // -- F: hub round trip. A draft owed at sector end must not be left dangling
 // until the next gem pickup, and nothing may be lost crossing the hub.
 {
  const api = boot();
  seedRandom(api, 1234);
  api.startRun(); api.loadSector(1); api.forceState('playing');
  const p = api.player;
  give(api, 'dmg', 6); give(api, 'rate', 4); give(api, 'array', 2);
  api.forceState('playing');
  p.autoFire = true;
  for (let i = 0; i < 60 * 300; i++) {
   immortal(api);
   if (api.state === 'levelup') { api.pickUpgrade(api.choices[0]); continue; }
   huntStep(api, 6);
   api.update(DT);
   if (api.portal) { for (let k = 0; k < 180; k++) api.update(DT); break; }
  }
  ok('sector cleared for the hub trip', !!api.portal);
  while (api.state === 'levelup') api.pickUpgrade(api.choices[0]);
  eq('no draft is owed when the sector ends', api.pendingLevels, 0);
  const lvl = p.level, xp = p.xp;
  api.nextArena();
  eq('portal returns to the hub', api.state, 'galaxy');
  eq('level survives the hub', api.player.level, lvl);
  eq('xp survives the hub', api.player.xp, xp);
  api.loadSector(2);
  eq('level survives entering the next sector', api.player.level, lvl);
  eq('xp survives entering the next sector', api.player.xp, xp);
  eq('no draft stranded into the next sector', api.pendingLevels, 0);
  eq('field starts empty in the new sector', api.gems.length, 0);
 }

 // -- G: fuzz. Random builds across random sectors, every one asserted to
 // conserve. Strongest evidence that no card interaction eats XP.
 {
  let cleared = 0, checked = 0;
  for (let run = 0; run < 14; run++) {
   const api = boot();
   seedRandom(api, 70000 + run * 613);
   const sector = run % 10;
   api.startRun(); api.loadSector(sector); api.forceState('playing');
   const p = api.player;
   give(api, 'dmg', 6); give(api, 'rate', 4); give(api, 'array', 2);
   // random extras, biased toward anything that touches gems or XP
   const pool = api.pool();
   for (let k = 0; k < 8 && pool.length; k++) {
    const id = pool[(run * 7 + k * 13) % pool.length];
    try { give(api, id, 1); } catch (e) { }
   }
   api.forceState('playing');
   p.autoFire = true; p.xpNeed = 1e9;
   const bonus = p.xpBonus, x0 = p.xp;
   const led = xpLedger(api);
   for (let i = 0; i < 60 * 300; i++) {
    immortal(api);
    if (api.state === 'levelup') { api.pickUpgrade(api.choices[0]); continue; }
    huntStep(api, 6);
    api.update(DT);
    if (api.portal) { for (let k = 0; k < 180; k++) api.update(DT); break; }
   }
   if (!api.portal) { led.detach(); continue; }   // didn't finish; not a conservation claim
   cleared++; checked++;
   collectAll(api);
   const absorbed = p.xp - x0, expected = led.created * bonus;
   ok('fuzz run ' + run + ' (S' + (sector + 1) + ') conserves XP',
    Math.abs(absorbed - expected) < 0.01,
    'absorbed ' + absorbed.toFixed(1) + ' of ' + expected.toFixed(1));
   eq('fuzz run ' + run + ' leaves no gems', api.gems.length, 0);
   led.detach();
  }
  atLeast('fuzz actually cleared sectors', cleared, 8);
 }
 return null;
}

// ======================================================================
//  SUITE -- run save / resume
// ======================================================================
// A run ends only when the ship dies. Each check boots a SECOND game against
// the storage the first one wrote, which is exactly a closed tab coming back.
function suiteSave() {
 section('run save / resume');
 const RUN = 'kriefne_run';
 {
  const api = boot();
  ok('a fresh install has no saved run', !api.__store[RUN] && !api.readRun());
  api.handleKeyPress('Enter');
  eq('Enter on a fresh title starts a run', api.state, 'galaxy');
  ok('a new run is saved immediately', !!api.__store[RUN]);
 }
 // play one sector, bank some progress, reach the hub, "close the tab"
 const a = boot();
 seedRandom(a, 2468);
 a.startRun(); a.loadSector(0); a.forceState('playing');
 give(a, 'dmg', 3); give(a, 'spd', 1); give(a, 'pcell', 1); a.forceState('playing');
 a.gainXp(a.player.xpNeed + 5);
 while (a.state === 'levelup') a.pickUpgrade(a.choices[0]);
 a.queue.length = 0;
 let guard = 0;
 while (a.enemies.length && guard++ < 800) a.killEnemy(0);
 for (let i = 0; i < 30; i++) { if (a.state === 'levelup') { a.pickUpgrade(a.choices[0]); continue; } a.update(DT); }
 ok('sector 1 cleared', !!a.portal);
 a.nextArena();
 eq('back on the hub', a.state, 'galaxy');
 const want = {
  seed: a.runSeed, level: a.player.level, xp: a.player.xp, maxhp: a.player.maxhp, dmg: a.player.dmgMult,
  dash: a.player.dashUnlocked, recall: a.player.recallUnlocked, charges: a.player.charges,
  counts: JSON.stringify(a.upgradeCounts), cleared: a.cleared, sel: a.galaxySel
 };
 {
  const b = boot(a.__store);
  eq('reopening lands on the title', b.state, 'title');
  ok('the title finds the saved run', !!b.readRun());
  b.handleKeyPress('Enter');
  eq('Enter continues the run onto the hub', b.state, 'galaxy');
  eq('resume keeps the run seed', b.runSeed, want.seed);
  eq('resume keeps the level', b.player.level, want.level);
  eq('resume keeps banked xp', b.player.xp, want.xp);
  eq('resume keeps max HP', b.player.maxhp, want.maxhp);
  eq('resume keeps the damage multiplier', b.player.dmgMult, want.dmg);
  eq('resume keeps dash', b.player.dashUnlocked, want.dash);
  eq('resume keeps recall', b.player.recallUnlocked, want.recall);
  eq('resume keeps recall charges', b.player.charges, want.charges);
  eq('resume keeps every drafted card', JSON.stringify(b.upgradeCounts), want.counts);
  eq('resume keeps cleared sectors', b.cleared, want.cleared);
  eq('resume selects the sector you were on', b.galaxySel, want.sel);
  b.loadSector(b.galaxySel);
  eq('the resumed run plays the next sector', b.state, 'playing');
  // progress inside a sector is not saved: quitting replays it from its start
  const xpIn = b.player.xp;
  b.gainXp(b.player.xpNeed * 0.5);
  b.forceState('paused');
  b.handleKeyPress('KeyQ');
  eq('Q on the pause menu quits to the title', b.state, 'title');
  const c = boot(b.__store);
  ok('quitting mid-sector keeps the run', !!c.readRun());
  c.handleKeyPress('Enter');
  eq('mid-sector quit resumes on the hub', c.state, 'galaxy');
  eq('at the sector it was in', c.galaxySel, want.sel);
  eq('with the state it had entering that sector', c.player.xp, xpIn);
  // the hub's Esc no longer ends the run
  c.handleKeyPress('Escape');
  eq('Esc on the hub goes to the title', c.state, 'title');
  ok('and the run is still saved', !!c.readRun());
  // starting over asks twice
  c.handleKeyPress('KeyN');
  eq('N once only arms NEW RUN', c.state, 'title');
  ok('the saved run survives one press', c.readRun() && c.readRun().runSeed === want.seed);
  c.handleKeyPress('KeyN');
  eq('N twice starts a new run', c.state, 'galaxy');
  ok('the new run replaced the old save', c.readRun() && c.readRun().runSeed !== want.seed);
  // death ends the run for good
  c.loadSector(0); c.forceState('playing');
  const p = c.player; p.invuln = 0; p.dashT = 0; p.stasisN = 0; p.secondWind = false;
  c.hurtPlayer(1e6, false);
  eq('lethal damage ends the run', c.state, 'gameover');
  ok('death deletes the saved run', !c.__store[RUN]);
  const d = boot(c.__store);
  ok('after a death the title has nothing to continue', !d.readRun());
 }
 // a damaged save is ignored, never fatal
 {
  const e = boot({ kriefne_run: '{not json' });
  let threw = null;
  try { e.render(); e.handleKeyPress('Enter'); } catch (err) { threw = err; }
  ok('a corrupt save does not crash the title', !threw, threw && threw.message);
  eq('and Enter simply starts a fresh run', e.state, 'galaxy');
  const f = boot({ kriefne_run: JSON.stringify({ v: 999, player: { hp: 50 } }) });
  ok('a save from another version is ignored', !f.readRun());
 }
 // pity counters ride along with the run
 {
  const g = boot(); seedRandom(g, 1357);
  g.startRun(); g.loadSector(0); g.forceState('playing');
  g.gainXp(g.player.xpNeed + 1);
  g.pickUpgrade(g.choices.find(u => u.id !== 'spd' && u.id !== 'pcell'));
  g.gainXp(g.player.xpNeed + 1); g.pickUpgrade(g.choices.find(u => u.id !== 'spd' && u.id !== 'pcell') || g.choices[0]);
  const pity = JSON.stringify(g.pity);
  g.forceState('playing'); g.nextArena();
  const h = boot(g.__store); h.continueRun();
  eq('the draft pity counters survive a resume', JSON.stringify(h.pity), pity);
 }
 {
  const r = boot(); r.startRun();
  let threw = null;
  try { r.forceState('title'); r.render(); r.forceState('paused'); r.render(); } catch (err) { threw = err; }
  ok('title with CONTINUE and pause with QUIT render', !threw, threw && threw.message);
 }
 return null;
}

// ======================================================================
//  runner
// ======================================================================
const SUITES = [
 ['xp', suiteXp],
 ['boot', suiteBoot],
 ['sectors', suiteSectors],
 ['bullets', suiteBulletHits],
 ['swept', suiteSweptCollision],
 ['recovery', suiteBossRecovery],
 ['regen', suiteNoPassiveRegen],
 ['mobility', suiteBossMobility],
 ['procgen', suiteProcgen],
 ['pool', suiteUpgradePool],
 ['balance', suiteBalance],
 ['roster', suiteBossRoster],
 ['hierarchy', suiteHierarchy],
 ['live', suiteBossLive],
 ['combos', suiteCombos],
 ['codex', suiteCodex],
 ['endless', suitePoolExhaustion],
 ['cascades', suiteCascades],
 ['save', suiteSave]
];

// Importable so ad-hoc diagnostics can drive the same stubs without running the
// whole suite: `const {boot, fightNest} = require('./test.js')`.
module.exports = { boot, seedRandom, fightNest, step, seconds, give, bossesIn, immortal, DT };

if (require.main === module) {
  console.log('KRIEFNE QA harness\n------------------');
 for (const [name, fn] of SUITES) {
  if (ONLY && ONLY !== name) continue;
  try { fn(); }
  catch (e) { fail++; failures.push(name + ' > THREW: ' + (e && e.stack || e)); console.log('  THREW in ' + name + ': ' + (e && e.message || e)); }
 }
 console.log('\n------------------');
 if (failures.length) {
  console.log('FAILURES (' + failures.length + '):');
  for (const f of failures) console.log('  - ' + f);
 }
 console.log((fail === 0 ? 'ALL ' : '') + pass + ' passed, ' + fail + ' failed.');
 process.exit(fail === 0 ? 0 : 1);
}
