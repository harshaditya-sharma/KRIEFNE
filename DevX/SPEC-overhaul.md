# KRIEFNE overhaul: bosses, pacing, maps, dev lab

**Status: v1, approved direction (2026-09-12).** This file lives in `DevX/`, which is gitignored. It's the source of truth for every agent working on the `overhaul` branch.

- **Decided** marks the user's call.
- **Proposed** marks the lead's design; implement it as written unless it breaks something, and then report the problem rather than improvising.
- *(tune)* marks a starting number that will be set by playing in the lab and by the fight simulator.

---

## 0. Decisions log

**v0 → v1: the user's answers.**
1. **Names.** All eight new boss names are approved: REVENANT, HYDRA, WYVERN, SENTINEL, COLOSSUS, PROGENITOR, KRAKEN, ECLIPSE.
2. **Kits.** The v0 ideas become each boss's **signature**. Every boss also needs **more secondary abilities**, and **higher-level bosses have phases**. Every boss must be unique and inventive.
3. **Stability.** Adding bosses or abilities **must not break the game**. §4 lists the stability rules.
4. **Summoned bosses** are tough enough to justify the sector they appear in.
5. **The chain is linear.** Each boss summons **the boss from the nest level directly below it on the ladder**. S40 ORACLE therefore calls S35 WYVERN (not WARDEN), and S50 ARCHON calls S45 SENTINEL. The user now calls sectors "levels".
6. **Recovery is varied, and each boss has its own.** Types include:
   - retreat and heal;
   - a translucent ghost form that heals;
   - teleport and heal;
   - a barrier or armour shell that heals.

   It stays budgeted and triggered by HP thresholds, never an endless loop.
7. **SINGULARITY (S100) finale.**
   - At 50% HP it summons the bosses one, two and three levels below it: CHORUS, NULLIFIER, ECLIPSE.
   - At 25% HP it pulls in and absorbs every remaining small enemy and summoned boss, then enters **Phase 2** with **twice the HP** and hidden attacks (quasars and more).
8. **Thralls.** Small versions of bosses join the common enemy pool as depth grows, wherever that makes sense.
9. **Where things live.** The spec and the lab live in `DevX/`, which is gitignored.
10. **Workflow.** Parallel subagents fix whatever can be fixed in parallel, and work starts now.

**Carried over from v0:**
- one boss per nest and no combined courts;
- teleporting is rare, and LEVIATHAN and ORACLE never teleport;
- longer fights, with S5 and S10 kept at their current length;
- distinct kits, with radial spirals rationed;
- non-circular silhouettes;
- ordinary enemies stream through nests;
- longer, denser normal sectors that keep scaling;
- more obstacle shapes and more tint shades;
- the pass-through bug fixed;
- Vampire 1–5 HP (**done** on the `overhaul` branch);
- all other card balancing parked.

**Taken by default (the user didn't object):**
- Past S100 comes the "Second Winter" (§1).
- Freeze works as described in §3.4.
- Fight-length targets are as in §6, and sector targets as in §7.

---

## 1. The ladder

There is one lead boss per nest and **never** a multi-boss court. A rank is a band of the chain; the ladder order is seniority within it. BASILISK and HARBINGER are promoted to SOVEREIGN so rank never falls as you go up the ladder, which keeps the summon rule lore-true.

| Nest | Boss | Rank | Epithet | Summons (the level below) | Recovery style |
|---|---|---|---|---|---|
| S5 | OVERLORD | ENFORCER | the Berserk | ordinary enemies (War Cry) | none |
| S10 | WARDEN | CAPTAIN | Bridge-Warden | OVERLORD | Raise the Bridge (barrier heal) |
| S15 | PHANTOM | CAPTAIN | the Undelivered | WARDEN | Ghost Form (translucent heal) |
| S20 | REVENANT | CAPTAIN | the Cold-Sleeper | PHANTOM | Sleeper Pod (retreat to pod, heal) |
| S25 | LEVIATHAN | LORD | the Lane-Wyrm | REVENANT | Shed Run (retreat heal) |
| S30 | HYDRA | LORD | the Three-Throated | LEVIATHAN | Regrowth (heads regrow, heal) |
| S35 | WYVERN | LORD | the Strafing Wing | HYDRA | Roost (perch heal) |
| S40 | ORACLE | LORD | the Rememberer | WYVERN ×2 | The Call (flee and heal while they live) |
| S45 | SENTINEL | LORD | the Shield-Wall | ORACLE | Shield-Wall (360° mirror heal) |
| S50 | ARCHON | SOVEREIGN | the Lawspeaker | SENTINEL (at 75% and 25%) | none, **decided** |
| S55 | COLOSSUS | SOVEREIGN | the Walled | ARCHON | Entrench (plates regrow, heal) |
| S60 | BASILISK | SOVEREIGN | Keeper of the Held | COLOSSUS | Shed Skin (decoy husk, heal) |
| S65 | PROGENITOR | SOVEREIGN | the Brood-Hall | BASILISK | Docking (fighters dock, heal) |
| S70 | HARBINGER | SOVEREIGN | the Horn | PROGENITOR | none (it announces; it never hides) |
| S75 | KRAKEN | SOVEREIGN | the Deep-Grasp | HARBINGER | Ink Retreat (heal inside ink) |
| S80 | JUGGERNAUT | SOVEREIGN | the Unsteered | KRAKEN | Vent Purge (heals, but rear exposed all round) |
| S85 | ECLIPSE | SOVEREIGN | the Dimming | JUGGERNAUT | Totality Step (teleport heal) |
| S90 | NULLIFIER | SOVEREIGN | the Silent | ECLIPSE | Silent Step (teleport heal, tracker jammed) |
| S95 | CHORUS | SOVEREIGN | the Norn-Choir | NULLIFIER | Re-form (echoes re-merge, heal) |
| S100 | SINGULARITY | APEX | the One-Eyed | CHORUS + NULLIFIER + ECLIPSE at 50% | Absorption → Phase 2 (×2 HP) |

The count per rank is 1 ENFORCER, 3 CAPTAINs, 5 LORDs, 10 SOVEREIGNs and 1 APEX, 20 in all.

**Past S100: the Second Winter.**
- The ladder repeats from OVERLORD as *returned* gods: one lead per nest, same kits, with HP on the post-Apex curve.
- Each returned god may chain one link deeper than at its debut.
- The chain restarts with the loop:
  - returned OVERLORD (S105) summons ordinary enemies only;
  - returned WARDEN (S110) summons returned OVERLORD;
  - and so on.
- The rule in code: *the lead of S(100+k) is ladder level k, and it summons ladder level k−5, or ordinary enemies when k−5 < 5.*
- The existing apex HP ramp still ends the run in the S110–S130 band.

---

## 2. The chain of command (summoning)

**The rule (decided).** A boss summons the boss of the nest level directly below it: S(n) calls S(n−5). SINGULARITY calls S95, S90 and S85 together. Summoning is the **only** way a second boss enters a fight.

**Timing (proposed, except where decided).**

| Band | Summon points |
|---|---|
| S10–S20 | one summon at 50% |
| S25–S45 | 60% and 30% |
| S50–S95 | 70% and 35% |
| ORACLE (decided) | its Call at 50%, re-arming (§5) |
| ARCHON (decided) | 75% and 25% |
| SINGULARITY (decided) | 50% (three bosses) |

**Summoned boss (proposed; decided "tough enough").**
- Full kit, full silhouette at 85% size.
- HP is *(tune)* 45% of what that kind would have leading a nest **at the current sector**. A summoned OVERLORD at S70 is therefore an S70-scaled OVERLORD.
- It hits at 85% of that damage.
- It never recovers, never banks the permanent bonus, and never phases past its first phase.
  - Its phase count is the lead's rule minus one; keep it simple: summoned bosses run their Phase-1 kit only.

**Chains (a summoned boss summoning its own):**
- S5–S45: never.
- S50–S95: one extra link. A summoned boss may summon once, at 50%.
- S100+: two links.

Each link's HP multiplies by *(tune)* 0.45 again.

**Limits:**
- at most 2 summoned bosses alive at once (the existing `LT_LIVE_CAP`), except SINGULARITY's 50% triple;
- a nest-wide budget of summoned bosses (the existing `ltBudgetFor`, retuned);
- a boss is never summoned before its own solo debut sector (the existing debut gate).

**Removed:**
- `deriveNest`, `pickCourt`, `escortsFor` and random escort picks;
- the random "any kind one rank below" subordinate choice;
- `commandDepth = 0` below S31.

`SIGNATURE_NESTS` becomes redundant, since every nest has exactly one lead.

---

## 3. Shared engine: new systems

### 3.1 Per-boss code blocks
Every boss's definition, kit, drawing and hit shape live in one clearly delimited block:

```
// ===== BOSS: LEVIATHAN =====
// ===== END BOSS: LEVIATHAN =====
```

- Dispatch is by kind through a registry: `BOSS_KITS[kind] = { attacks, signature, recovery, phases, draw, hitParts }`.
- Parallel agents then only ever edit their own blocks.
- Shared primitives live in a separate `// ---------- boss primitives ----------` section.

### 3.2 Attack primitives
Build these once, telegraph them all, and route every hit on the player through `hurtPlayer` with a `srcOf` stamp.
- **Beam.**
  - Locked or rotating, and single, twin (both ends) or four-armed.
  - It's a ray-cast **occluded by obstacles**: the beam stops at the first obstacle, so cover works.
  - It has a telegraph line, then goes live, with tick damage (0.2 s).
  - Used by ARCHON's Verdict, PHANTOM's beam, HYDRA's beam head, ECLIPSE's Corona, NULLIFIER's Null Lance and SINGULARITY's Quasar Jets.
- **Marks.** Several telegraphed circles that all detonate together.
  - A solver guarantees an escape: at least one gap at least 2.2× the ship's diameter on a ring 180 px around the player.
  - Used by ORACLE, HARBINGER's Meteor, WYVERN's lanes and Dive Bomb.
- **Trail discs.** Dropped discs that shrink, with a harmless window when first dropped.
  - Used by LEVIATHAN's Wake and WYVERN's fire lines.
- **Shockwave.** An expanding ring with an effect on contact: `damage | freeze | knockback | jam`.
  - Used by BASILISK, COLOSSUS, SENTINEL's Riposte and NULLIFIER.
- **Bouncing rounds.** Enemy rounds that reflect off obstacles and walls N times (the player's `reflectBullet` logic, reused).
- **Reflect arc.** A shield arc that bounces **player** rounds back as enemy rounds.
  - Used by SENTINEL.
  - Cap how many rounds can be reflected per second so a 12-shot build can't delete itself in a frame; excess rounds are absorbed.
- **Parts.** Destructible child hit-circles attached to a boss, each with its own HP and optional attack.
  - Used by HYDRA's heads, COLOSSUS's plates, PROGENITOR's bays, ECLIPSE's moon, SENTINEL's anchor nodes, WARDEN's barrier plates and REVENANT's pod.
- **Temporary obstacles.** Obstacles with a lifetime, pushed into `arena.obs` and removed on expiry.
  - Never placed within 120 px of the player, the exit or another temporary obstacle.
  - Never allowed to seal a region: check reachability with the existing BFS before placing, and skip placement if it would seal.
  - Used by COLOSSUS's Boulders and JUGGERNAUT's Wreck Wake.
- **Tether.** A line from boss to player that pulls; a dash breaks it.
  - Used by KRAKEN's Grasp.
- **Bullet-erase zone.** A region that deletes player rounds that enter it.
  - Used by NULLIFIER.
  - Cap its area so it never covers the boss entirely.
- **Currents and pull.** Movement forces.
  - Used by SINGULARITY's gravity and KRAKEN's Whirlpool.
  - A dash always overcomes them.

### 3.3 Status effects on the ship
Status effects live in one `player.status` block with a single update loop and one HUD tag each:

| Status | What it does |
|---|---|
| root (existing) | no movement |
| **freeze** | no movement and no dash |
| jam (existing) | abilities and blink off |
| slow | reduced speed |
| tether | pulled toward a point |
| knockback | an impulse that decays |

**Guns always keep firing** under every status: the holmgang clause.

### 3.4 Freeze (default taken)
- Duration 0.8–1.2 s, set per attack.
- Afterwards **1.5 s freeze immunity**, so it can't chain.
- It's drawn as a frost rim on the hull with a FROZEN floater. Reduced motion shows the rim with no animation.

### 3.5 Teleport policy
- **Allow-list:**
  - PHANTOM: blink, always;
  - ECLIPSE and NULLIFIER: only as their recovery;
  - CHORUS: echo Swap.
- Everything else **never** changes position except by moving.
- **Replace for everyone:**
  - `bossReposition` (the anti-stuck blink) becomes a steering unstick: a wider probe, a path toward the player through open cells, and a visible **SURGE** speed burst. If a boss is truly wedged (more than 4 s), it slides along the obstacle's normal. Never a jump.
  - The DESPERATE relocation is removed; the minion surge stays.
  - LEVIATHAN's `burrow` is removed.
- **Add a test:** step every non-allow-listed boss for 60 simulated seconds and assert no frame-to-frame position jump greater than max speed × dt × 3.

### 3.6 Recovery economy
- **Remove:** the generic `bossRetreat` and `bossPhase` beats, and the old rule of 2 recoveries per boss.
- **Replace:** each boss's own recovery style, from §5.
- **Rules for every recovery:**
  - triggered only by HP thresholds (default 55%, and 30% for bosses allowed two), never by a timer;
  - never in the first 12 s;
  - it has a visible counter-play, shown on screen (plates to break, a pod, anchors, a husk, fighters, ink to enter);
  - healing comes from a capped pool (default 8% of max per recovery *(tune)*), **except** ORACLE's Call and SINGULARITY's Absorption, which are bespoke;
  - RELENTLESS (the safety valve) turns every recovery off. It triggers at twice the boss's target fight length *(tune)*, replacing the flat 180 s.
- The holmgang clause in LORE.md becomes: *"A god may mend only in the manner its makers built, only when wounded, and never once the contest has run too long."*

### 3.7 Phases
| Band | Phases |
|---|---|
| S5–S20 | one phase, plus enrage below 30% (faster cadence) |
| S25–S45 | **two phases**; Phase 2 at 50% adds an attack and upgrades the signature |
| S50–S95 | **three phases**, at 66% and 33% |
| S100 | Phase 1, then Absorption, then Phase 2 (a new form) |

A phase change is a readable beat:
- a 0.8 s pause;
- a ring pulse;
- the callout `<NAME> — PHASE II` (or `III`);
- the bar gains a phase tick mark;
- the boss is invulnerable **only** for those 0.8 s, and the bar shows it.

### 3.8 Hit shapes
- Hits test against the **drawn** scale (include `vscale`).
- Non-circular bosses declare `hitParts`: a list of circles in local space, rotated with the body.
- Parts (§3.2) are hittable separately.
- LEVIATHAN's segments are hittable; 60% of the damage passes to the boss.

### 3.9 Radial rationing
The spinning star or spiral volley is used only by:
- WARDEN: Twinwave rings;
- HARBINGER: Ricochet Spiral and Echo Wall;
- SINGULARITY: Spiral Wall.

No other boss may use `burst`, `spiral` or `spiralwall`.

---

## 4. Stability rules: "adding them must not break the game"

1. **Entity caps.** Every primitive draws against global caps:

   | Pool | Cap |
   |---|---|
   | enemy rounds | 420 |
   | hazards and discs | 260 |
   | marks | 16 |
   | beams | 8 |
   | temporary obstacles | 6 |
   | parts per boss | 8 |
   | enemies alive | 40 |

   At a cap, skip the spawn and never throw.
2. **Every attack is telegraphed** at 0.5 s or more (0.35 s is allowed for small aimed shots). No damage lands on the frame something appears.
3. **No unwinnable states:**
   - freeze immunity;
   - the escape gap for marks;
   - temporary obstacles pass the BFS check;
   - tethers break on dash;
   - pull forces are always beatable by a dash;
   - bullet-erase zones never cover the boss's whole body;
   - reflection is capped.
4. **Lifecycle.** All boss-owned state (beams, marks, discs, parts, temporary obstacles, tethers, status) is cleared by:
   - `loadArena`;
   - the boss's death;
   - `endReplay`;
   - `continueRun`.

   The replay snapshot must round-trip.
5. **Saves.** Bump `RUN_V`.
   - Old saves keep level, cards and `clearedMax`.
   - Nest rosters are rebuilt from the ladder.
   - A save sitting inside a nest restarts that nest.
6. **Performance.** The 960×640 headless run at S100 with SINGULARITY Phase 2 plus a full chaff stream must run a simulated 120 s with an average frame update under 4 ms in node.
7. **Per-boss fuzz test**, run for each of the 20 kinds against a scripted pilot for 90 simulated seconds at its debut sector, both as lead and as summoned. It asserts:
   - no exceptions;
   - no NaN positions;
   - everything stays in bounds;
   - caps are respected;
   - no illegal teleports;
   - the fight ends before RELENTLESS plus 60 s with the Homing Hose build.
8. **Codex and UI.**
   - The codex handles 20 bosses (pagers exist) and any rank grouping.
   - The title line reads "20 bosses".
   - The hub lore for a nest names the lead and who it will call.
   - The phone-width layouts still fit.

---

## 5. The twenty bosses

Each entry follows the same format:
- **Sig**: the signature;
- **Sec**: the secondary attacks, cycled by the phase timer;
- **P2/P3**: phase changes;
- **Rec**: recovery;
- **Look**: the silhouette.

Numbers are *(tune)*.

### S5 OVERLORD · ENFORCER
- **Sig: Berserk Charge.** A 0.6 s telegraphed line, then a charge. When enraged it rebounds off a wall once.
- **Sec:**
  - **Cleave:** a tracking fan sweep.
  - **Stomp:** a close slam ring.
  - **War Cry:** at 50%, a 2 s speed-up while a pack of ordinary enemies (drones and stalkers) rallies to it.
- **Rec:** none. It teaches the fight, not the escape.
- **Look:** a war-prow chevron over an octagon core.
- **Fight length:** keep as now. The radial burst is removed.

### S10 WARDEN · CAPTAIN
- **Sig: Toll Gate.** It plants three pylons that link with damaging beams for 4 s. Cross only through the gaps.
- **Sec:**
  - **Twinwave:** two staggered rings.
  - **Slam.**
  - **Lane Lock:** two parallel walls of slow rounds forming a corridor that narrows.
- **Rec: Raise the Bridge.** At 55%, six barrier plates (parts) ring it. It heals while three or more stand; break them to stop it.
- **Summons:** OVERLORD at 50%.
- **Look:** a hex core inside a gate arch of two trapezoid pylons.

### S15 PHANTOM · CAPTAIN · teleporter
- **Sig: Undelivered Beam.** It locks a line, telegraphs 0.7 s, then fires (a beam primitive, occluded).
- **Sec:**
  - **Blink Fan:** it blinks 190–300 px, then fires a fan.
  - **Afterimage:** each blink leaves a decoy that fires one fan and fades.
  - **Crossfire:** it blinks to your flank and beams in sync with its afterimage from the other side.
- **Rec: Ghost Form**, once. It goes translucent and takes 30% damage while healing from its pool; killing its summoned escorts breaks it.
- **Summons:** WARDEN at 50%.
- **Look:** a diamond inside a counter-spinning frame, with a trailing ghost.
- **Fight:** longer (HP up).

### S20 REVENANT · CAPTAIN · new
- **Sig: Rime Bolts.** Slow pale rounds; a hit **freezes** (1.0 s).
- **Sec:**
  - **Frost Lane:** a line of drifting frost mines along its aim; touching one freezes.
  - **Shatter Dash:** a telegraphed short dash that bursts into 6 shards at the end.
  - **Cold Snap:** for 4 s, standing still for more than 0.8 s freezes you, so keep moving.
- **Rec: Sleeper Pod.**
  1. It plants a cryo pod (a part) near an edge at fight start.
  2. At 55% it walks back and docks, healing 2.5%/s while docked.
  3. Destroying the pod, or dealing 6% of its HP while it's docked, forces it out.
- **Summons:** PHANTOM at 50%.
- **Look:** three overlapping cryo capsules (rounded rects) in a Y.

### S25 LEVIATHAN · LORD · moved from S30
- **Sig: Wake Trail.**
  - The head and each segment keep dropping discs the size of that segment. They shrink to zero over 3.5 s, so a fading copy of its tail lies behind it.
  - Touching a disc hurts (tick 0.5 s). Discs are harmless for their first 0.25 s.
  - They're drawn in the harm colour at low alpha.
- **Sec:**
  - **Whip:** a sharp turn that swings the tail through a wide arc.
  - **Coil:** it circles you, fencing you in with its trail, then tightens.
  - **Lunge:** a straight telegraphed dash.
- **P2 (50%):**
  - **Segment Volley:** each segment fires one round at you in sequence, tail to head.
  - The trail lasts 5 s.
- **Rec: Shed Run.** At 55% it runs away along its own trail, which grows 1.5× longer, and heals while it hasn't been hit for 2 s.
- **Summons:** REVENANT at 60% and 30%.
- **Never teleports.** Burrow and mines are removed. The body moves as one piece: every forced move drags the segments along.
- **Look:** an armoured wedge head with mandibles, then 5 shrinking segments.

### S30 HYDRA · LORD · new
- **Sig: Three Throats.** Three heads (parts) on necks. Each has HP and its own attack:
  - **Frost head:** rime bolts that freeze.
  - **Fan head:** a 5-round fan.
  - **Beam head:** a locked beam.
  While any head lives, the body takes 50% damage.
- **Sec (body):**
  - **Tail Slam:** a ring.
  - **Head Swap:** the heads rotate position so the beam head faces you.
  - **Acid Spit:** lingering pools.
- **P2 (50%, or when every head is gone):** the surviving heads fire together, and a lost head leaves a stump that sprays shrapnel.
- **Rec: Regrowth.** A destroyed head regrows after 12 s and restores 4% of body HP, twice at most. Kill the body during that window.
- **Summons:** LEVIATHAN at 60% and 30%.
- **Look:** a heptagon body with three lobed necks.

### S35 WYVERN · LORD · new
- **Sig: Strafing Run.** A lane lights up across the arena (0.9 s), then it dives down it at high speed, leaving a fire line (trail discs).
- **Sec:**
  - **Wing Gust:** a cone that pushes you back (knockback).
  - **Talon:** a close double slash.
  - **Dive Bomb:** a marked circle, then it lands from above with a shockwave.
- **P2 (50%):** runs come in crossing pairs (an X) with the gap marked.
- **Rec: Roost.**
  1. At 55% it lands on the largest obstacle and heals.
  2. While perched it's in reach.
  3. Dealing 5% of its max HP knocks it off.
- **Summons:** HYDRA at 60% and 30%.
- **Look:** a swept delta of triangles and parallelograms.

### S40 ORACLE · LORD
- **Sig: Strike Marks.**
  - Every ~6 s it marks 4 + 1 per 20 sectors spots (max 8): one on you, one on your heading, the rest near you.
  - They fill red over 1.1 s, then all detonate together. The escape gap is guaranteed.
- **Sec:**
  - **Clockbeam:** the rotating twin stream, kept.
  - **Wards:** kept.
  - **Foresight:** after you dash, marks spawn at your dash end.
- **P2 (below 25%, or once the Call resolves):** marks come in two staggered waves.
- **The Call (Rec, decided in outline):**
  1. At 50% it summons **two WYVERNs**, then **walks away**: no teleport, stays in the arena, avoids corners.
  2. It **heals ~1.5%/s for as long as either Wyvern lives, even while being shot.** Link-lines from each Wyvern show where the healing comes from.
  3. Both Wyverns dead: the healing stops, it returns to fight, and there is no re-call.
  4. If it reaches 100% while a Wyvern lives, the Call **re-arms**: at 50% again it calls two more. Maximum 2 re-arms, and none after RELENTLESS.
  5. The Wyverns count against the summon cap as a pair.
- **Look:** a lidded almond eye whose pupil tracks you.

### S45 SENTINEL · LORD · new
- **Sig: Mirror Shield.** A frontal arc (about 100°) reflects your rounds back as enemy rounds. It turns toward you at 70°/s, so flanking wins. The reflection is capped (§3.2).
- **Sec:**
  - **Bulwark Push:** it advances behind the shield and shoves on contact.
  - **Spear Line:** a straight lance volley.
  - **Riposte:** it stores the damage it reflected and releases it as a burst ring when the shield drops.
- **P2 (50%):** the shield splits into front and rear arcs rotating in opposite directions. Shoot through the gaps.
- **Rec: Shield-Wall.** At 55% the mirror closes all the way round for up to 5 s while it heals. Three anchor nodes (parts) orbit outside; break them to drop the wall.
- **Summons:** ORACLE at 60% and 30%. A summoned ORACLE uses no Call (Phase-1 kit only).
- **Look:** a tall trapezoid shield in front of a square core.

### S50 ARCHON · SOVEREIGN · signature nest
- **Sig: Verdict.** A twin-ended beam.
  1. A 1.2 s telegraph shows both lines across the whole arena.
  2. The beams go live and rotate 180–270° over ~4 s. Ticks show which way.
  3. Obstacles block them: hide behind cover, or dash through one beam and then the other.
- **Sec:**
  - **Decree:** lines of slow rounds march across the arena, with gaps.
  - **Gavel:** a close slam.
  - **Holmgang Circle:** it marks a duelling ring around you both for 6 s; leaving the ring hurts.
- **P2 (66%):** Verdict and Decree come in combination, and the Circle shrinks over its duration.
- **P3 (33%):** the Verdict has four arms (a cross), and it reverses once mid-sweep.
- **Rec: none (decided).** Tanky HP.
- **Summons:** SENTINEL at 75% and 25% (decided timing, linear rule).
- **Look:** a command crown built from overlapping trapezoids.

### S55 COLOSSUS · SOVEREIGN · new
- **Sig: Armour Quadrants.** Four plates (parts) block rounds from their side until broken. Pick a side and dig in.
- **Sec:**
  - **Triple Stomp:** three concentric shockwaves.
  - **Boulder Throw:** a thrown boulder lands as a temporary obstacle (§3.2).
  - **Quake Line:** a fissure travels along the ground toward you.
- **P2 (66%):** the plates orbit slowly.
- **P3 (33%):** the plates shatter into an orbiting shrapnel ring, and it stomps faster.
- **Rec: Entrench.** At 55% and 30% it sinks and regrows one broken plate; it heals while two or more plates stand.
- **Summons:** ARCHON at 70% and 35%.
- **Look:** a stacked octagon and square fortress.

### S60 BASILISK · SOVEREIGN · promoted
- **Look (decided):** a cobra-hood face seen from above: flared hood, eye-spots, head forward. The coil is gone.
- **Sig: Hood Flare.** The hood spreads (0.9 s animation), then a shockwave ring goes out. Caught in it, you're **frozen** (1.2 s).
- **Sec:**
  - **Gaze:** a telegraphed damage cone, damage only.
  - **Strike:** a fast cobra lunge and recoil.
  - **Spit:** a venom fan that leaves slowing puddles.
- **P2 (66%):** a double Hood Flare, the second ring delayed 0.6 s.
- **P3 (33%):** the gaze sweeps.
- **Rec: Shed Skin.** At 55% and 30% it leaves a husk decoy (a part that draws homing and absorbs rounds) and slithers away, healing while the husk stands.
- **Summons:** COLOSSUS at 70% and 35%.
- **Removed:** the line-charge that left damage circles, and the spikes.

### S65 PROGENITOR · SOVEREIGN · new
- **Sig: Launch Bays.** Four bays (parts) launch squadrons of fast fighters (a new ordinary enemy type, "fighter"). Destroy the bays to stop them.
- **Sec:**
  - **Broadside:** paired line volleys from both flanks.
  - **Minefield:** bays drop mines behind it.
  - **Recall Beam:** it tows damaged fighters in to repair them.
- **P2 (66%):** bigger squadrons.
- **P3 (33%):** the hull splits into two halves that fight separately. They share the HP bar, and both must die.
- **Rec: Docking.** At 55% and 30% fighters return to dock, and each docked fighter heals 1.5%. Kill them in transit.
- **Summons:** BASILISK at 70% and 35%.
- **Look:** a long hull built from parallelograms, with bay notches.

### S70 HARBINGER · SOVEREIGN · promoted
- **Bug:** its `meteor` phase currently has **no code** (a dead quarter-cycle). Build it.
- **Sig: Ricochet Spiral.** Spiral arms of rounds that bounce off obstacles and walls up to 2 times.
- **Sec:**
  - **Horn Blast:** a telegraphed wide cone with knockback.
  - **Meteor:** telegraphed impact marks on your heading.
  - **Echo Wall:** a one-gap ring whose rounds bounce once.
- **P2 (66%):** the Horn Blast leaves a sound-wall ring that reflects its own rounds.
- **P3 (33%):** **Last Call**, every cadence ×1.3.
- **Rec: none.**
- **Summons:** PROGENITOR at 70% and 35%.
- **Look:** a flared horn or bell (a cone plus rings).

### S75 KRAKEN · SOVEREIGN · new
- **Sig: Tentacle Arms.** Two long arms sweep slow arcs; obstacles don't stop them. They're hittable parts: a severed arm regrows in 15 s.
- **Sec:**
  - **Grasp:** a tether that pulls you in; a dash breaks it.
  - **Ink Mines:** slowing fields, drawn clearly with no loss of visibility.
  - **Whirlpool:** a current that drags you around it.
- **P2 (66%):** a third arm.
- **P3 (33%):** the arms grab temporary debris and fling it.
- **Rec: Ink Retreat.** At 55% and 30% it pulls back into an ink cloud and heals while you're outside it. Enter the ink (slowed) to stop it.
- **Summons:** HARBINGER at 70% and 35%.
- **Look:** a nonagon mantle with limbs.

### S80 JUGGERNAUT · SOVEREIGN
- **Sig:** Ram plus Vent (kept): an armoured prow and exposed rear, with the facing locked mid-ram.
- **Sec:**
  - **Wreck Wake:** rams drop debris as temporary cover.
  - **Exhaust Plume:** a burning cone behind it.
  - **Wall Quake:** a wall impact sends a ring out.
- **P2 (66%):** rams rebound, chaining twice.
- **P3 (33%):** **Runaway**, a near-continuous ram.
- **Rec: Vent Purge.** At 55% and 30% it stops for 4 s and heals, but takes 2.5× damage from **every** side while purging. Risk against reward.
- **Summons:** KRAKEN at 70% and 35%.
- **Look:** a ram prow and armoured block with a vent (sharpened).

### S85 ECLIPSE · SOVEREIGN · new · teleports only to recover
- **Sig: Moon-Shield.** A moon (a part) orbits it, blocks rounds and fires its own bursts.
- **Sec:**
  - **Corona:** beams from the rim.
  - **Totality:** a closing ring of harm that shrinks the safe arena for a few seconds.
  - **Crescent:** the moon is flung out like a boomerang and returns.
- **P2 (66%):** two moons.
- **P3 (33%):** the moon breaks into a ring of fragments.
- **Rec: Totality Step.** At 55% and 30% it vanishes during a Totality and reappears at the far side, healing for 4 s. The tracker still shows it.
- **Summons:** JUGGERNAUT at 70% and 35%.
- **Look:** a ring with a crescent moon.

### S90 NULLIFIER · SOVEREIGN · teleports only to recover
- **Sig: Disruptor Field** (kept): jams abilities and blink.
- **Sec:**
  - **Silence Pulse:** a shockwave that jams dash for 3 s.
  - **Null Lance:** a beam that erases your rounds along its line.
  - **Void Mines:** small bullet-erase zones.
- **P2 (66%):** the field follows you.
- **P3 (33%):** the Null Lance rotates.
- **Rec: Silent Step.** At 55% and 30% it vanishes, jams the off-screen tracker for 3 s, reappears near an edge and heals from its pool.
- **Summons:** ECLIPSE at 70% and 35%.
- **Look:** split prism halves with a null core.

### S95 CHORUS · SOVEREIGN
- **Sig: Split** (kept): echoes at 66% and 33%.
- **Sec:**
  - **Harmony:** echoes fire synchronised crossfire from triangulated spots.
  - **Swap:** echoes trade places (allowed teleport).
  - **Canon:** each echo repeats the original's last pattern 0.5 s later.
- **Phases:** its splits are its phases.
- **Rec: Re-form.** An echo touching the original merges back and restores its HP. Kill echoes before they rejoin.
- **Summons:** NULLIFIER at 70% and 35%.
- **Look:** three fused lobes.

### S100 SINGULARITY · APEX

**Phase 1.**
- **Sig: Gravity.** A pull that a dash always beats.
- **Sec:**
  - **Spiral Wall:** a one-gap wall.
  - **Debris:** orbital junk.
  - **Tidal Mark:** marks that pull you toward them before they detonate.

**50%: the Convocation.** It summons **CHORUS, NULLIFIER and ECLIPSE** at summoned strength (one, two and three levels below), each running its Phase-1 kit.

**25%: Absorption.**
1. Every remaining ordinary enemy and summoned boss spirals in over 3 s and is consumed.
2. The screen pulses and the bar refills to **2× max HP**: Phase 2 has twice the HP.
3. The more it absorbed, the more of its Phase-2 bar starts filled *(tune: each absorbed boss +10% of the Phase-2 bar)*. Clearing summons early is rewarded.

**Phase 2: Quasar.** The hidden kit:
- **Quasar Jets:** two opposite beams from its poles, slowly precessing and occluded by cover.
- **Accretion Disk:** a rotating ring of debris that grinds you if you cross it.
- **Hawking Sparks:** slow motes that burst into rounds.
- **Lensing:** your rounds curve around it (a gravitational lens) and homing gets weaker nearby. This is the endgame answer to bullet-hose builds.
- **Event Horizon:** the arena edge drifts inward.
- **Spaghettify:** a tidal stretch that slows sideways movement along a marked axis.

**Look.**
- Phase 1: accretion rings around a void.
- Phase 2: bipolar jets and a brighter disk.

---

## 6. Fight length and boss HP

Targets are for the **Homing Hose** build (barrels + Seeker + damage) at the depth's normal pick count, measured by the **fight simulator** (§10):

| Nests | Target |
|---|---|
| S5, S10 | as now |
| S15–S20 | 60–80 s |
| S25–S45 | 75–105 s |
| S50–S95 | 100–150 s |
| S100 | 150–210 s, both phases |

**Knobs:**
- per-boss `hp`;
- a steeper `EXP_HP` segment from S15 on;
- summoned-boss HP;
- the nest chaff stream.

The post-Apex wall stays.

---

## 7. Normal sectors

**Target clear times for Homing Hose:**
- 50–75 s for S1–S9;
- 70–105 s for S11–S49;
- 100–140 s for S51 and beyond.

**Changes.**
1. **Counts keep growing** with depth; there's no flatline at S12. About `12 + 2.2 × sector` total, bounded by world size and a rising alive cap.
2. **Spawning.**
   - Reinforcements come in 700–1000 px out, off-screen, with a visible approach.
   - They trickle more slowly, in bigger packs.
   - The opening wave stays small.
3. **HP.** Normal enemies get their own HP curve, fitted by the simulator. Deep species behave more sharply.
4. **Nests stream chaff.** Packs from the sector's pool (thralls included) arrive every 6–10 s, shrinking with depth, under an alive cap. The stream stops when the lead dies; whatever is left must be cleared.

---

## 8. Thralls: small bosses as common enemies

- **Unlock:** a boss's thrall joins normal sectors 25 sectors after its debut. That runs from OVERLORD at S30 to KRAKEN at S100. After S100 every thrall up to ECLIPSE is unlocked.
- **No thralls** for NULLIFIER, CHORUS or SINGULARITY: they don't make sense small.
- **Form.**
  - 60% size.
  - HP around 6–10 brutes' worth at that sector.
  - Its signature, simplified, plus one secondary.
  - No summons, no recovery, no phases, no bonus bank.
  - A small HP pip instead of a boss bar.
  - The PHANTOM thrall blinks.
- **Numbers:** up to 1 alive when a kind first unlocks, rising to 3 deep in the run, drawn from every unlocked kind.
- **Codex:** it counts as seen for its parent, shown as "OVERLORD THRALL".

---

## 9. Bug: rounds passing through enemies

Reproduce first in the lab: hitboxes on, the Homing Hose build, against WARDEN and LEVIATHAN. Then fix all four likely causes.

1. **Homing orbits.** A turning circle of 120–170 px makes missed rounds loop around the target.
   - **Fix:** terminal guidance, a much sharper turn once within about 2 turning radii, so the round converges.
2. **Pierce with homing.** After piercing, the round keeps steering back to the target it already hit and passes through it untouched.
   - **Fix:** homing skips targets in `hitUid`.
3. **Drawn body bigger than the hit circle.** `vscale` (up to 1.08), collars and rings are drawn larger than the hit test.
   - **Fix:** the hit test uses the drawn scale, with `hitParts` for non-circular bosses (§3.8).
4. **LEVIATHAN's segments can't be hit.**
   - **Fix:** make them hittable, with 60% of the damage passed to the boss.

---

## 10. Measurement: the fight simulator

A `test.js --only fightsim` suite runs the **real** update loop at a fixed dt with a scripted pilot:
- it auto-aims;
- it strafes in circles;
- it dashes on telegraphs;
- it's invulnerable, but logs the damage it would have taken.

It fights with three reference builds, drafted through the real level-up loop:
- **Balanced**;
- **Greedy**;
- **Homing Hose:** barrels + Seeker + damage.

It reports:
- real seconds-to-kill per nest;
- sector clear time for normal sectors;
- damage taken per attack.

It asserts the target bands in §6 and §7. It replaces the analytic `gunDps × 0.45` model as the source of truth; the old model can stay as a quick sanity check. `VERBOSE` prints a table.

---

## 11. Maps

- **Shapes to add:**
  - triangles (equilateral, isosceles, right);
  - square;
  - rhombus;
  - parallelogram;
  - kite;
  - heptagon;
  - nonagon;
  - decagon;
  - L-shapes and crosses;
  - **compounds:** two or three overlapping convex pieces placed as one obstacle group.
- **Rules:**
  - Collision stays per convex piece.
  - Overlap is allowed within a compound group.
  - Every map still passes BFS validation.
- **Shape palette per layout:**
  - debris: shard triangles and rhombi;
  - corridors: parallelogram girders;
  - bastion: heptagon and nonagon bunkers;
  - spokes: kites and bars;
  - arena: a ring of mixed polygons;
  - scatter: everything.
- **Tints:**
  - 12–14 hue stops (adding slate, sea-green, moss, ochre, indigo and mauve);
  - a per-sector hue jitter of ±8°;
  - two lightness variants per hue.
- **The same restraint:**
  - chroma at or below 0.04;
  - the red-hue guard stays;
  - wreckage's lit edge stays bare silver.
- Themes keep their music; new hues borrow the nearest theme's music.

---

## 12. DevX lab

- `DevX/` is in `.gitignore` and `.vercelignore` (**done**).
- **`node DevX/serve.mjs`** serves the repo at `http://localhost:5173` with no npm dependencies. `/DevX/lab.html` loads the real `game.js` plus an HTML side panel:
  - **Jump:** any sector 1–150, with a chosen level and HP.
  - **Boss:** spawn any kind as lead, summoned or thrall. Force any attack on loop, or step through its kit. Force a phase. Freeze its AI.
  - **Build:** any card at any stack count, plus presets (Balanced, Greedy, Homing Hose, empty).
  - **Pilot:**
    - god mode;
    - "log damage, don't die";
    - infinite dash;
    - time scale from 0.25× to 2×.
  - **Overlays:**
    - hitboxes (bodies, parts, segments, hazards, marks, beams);
    - HP numbers;
    - fight timer;
    - DPS meter;
    - time-to-kill.
  - **Field:** kill all, heal, stop or start spawns.
  - **Record:** a per-fight JSON log (duration, damage dealt and taken per attack) to copy.
  - **Deep links,** for example `lab.html?s=25&boss=leviathan&build=hose&god=1`.
- **Game hooks** go on `window.__kriefne`: `setCards`, `spawnBoss`, `forceAttack`, `forcePhase`, `setGod`, `timeScale`, `showHitboxes`, `aiFreeze`.
  - They're inert unless `window.__KRIEFNE_DEV === true` is set before `game.js` loads.
  - As bosses move to `BOSS_KITS`, `forceAttack` lists the attacks from the registry.

---

## 13. Lore, codex and docs

**The eight new bosses** each need:
- a `BOSSDEF` entry;
- a pigment (new muted hues within the existing rules);
- a `DEBUT_LORE` line (the gods' register);
- a `CODEX_BOSSES` field note (KRIEFNE's dry voice);
- a LORE.md §8 row.

Their transmissions come later.

**Rank changes:** BASILISK and HARBINGER become SOVEREIGN. Update their lore lines ("A LORD OF…").

**Holmgang clauses in LORE.md §7:**
- mending becomes the rule in §3.6;
- the calling clause becomes: *"A god may call only the god directly beneath it on the trail."*

**UI and docs text:**
- The hub nest lore names the lead and whom it calls.
- The title line reads "20 bosses".
- README "The chain of command" and PRODUCT.md "Content" are updated.
- The LORE.md §11 L04 trigger (S20, "first two-god court") changes to "first summoned god" (S10).

---

## 14. Tests

- **Ladder:**
  - exactly one lead per nest, S5–S100, equal to the debut;
  - summons are always S(n−5) (S100 summons its three);
  - no boss is summoned before its debut;
  - chain depth and caps hold.
- **Behaviour:**
  - ORACLE's Call, heal, stop and re-arm (maximum 2);
  - ARCHON's 75/25 SENTINELs;
  - SINGULARITY's 50% triple, 25% absorption and 2× HP;
  - LEVIATHAN never teleports and its segments stay attached;
  - the no-illegal-teleport sweep;
  - freeze immunity;
  - HARBINGER's meteor actually does something;
  - every recovery has a counter that works;
  - phase transitions fire once each.
- **The per-boss fuzz** from §4.7.
- **The fight simulator** bands from §10.
- **Maps:** the new shapes appear, compounds validate, and tint jitter stays in the chroma band.
- **Vampire 1–5:** done.
- **Saves:** migration from `RUN_V` 1.

---

## 15. Work plan

The branch is `overhaul`. Each agent works in its own git worktree, commits there, and the lead merges.

**Wave 1** runs in parallel:

| Stream | Owns |
|---|---|
| A | the DevX lab, and the `__kriefne` dev hooks |
| B | the pass-through bug (bullet update, homing, `applyBulletHit`, `bulletSweep`, hit scale) |
| C | maps: shapes and tints (obstacle generation, layouts, `THEMES`, `mkSectorPal`) |
| D | the fight simulator (`test.js`), plus normal-sector pacing (`compFor`, the wave director, `spawnEdgePos`, `loadArena` opening count) |
| E | the boss engine: the ladder and chain, the per-boss block restructure and `BOSS_KITS` registry, primitives, status and freeze, the teleport policy, the recovery framework, the phase framework, the nest chaff stream, the HARBINGER meteor stub, placeholder entries for the eight new bosses, `RUN_V` |

**Wave 2** starts after E merges. Boss kits are built in four parallel groups, each editing only its own boss blocks:
- S5–S25;
- S30–S50;
- S55–S75;
- S80–S100, including SINGULARITY's finale.

Each group also writes its lore, codex and silhouettes.

**Wave 3:**
- thralls;
- the HP and pacing fit with the simulator;
- the docs sweep;
- the full test and performance pass;
- hand-testing in the lab.

---

## 16. Handoff and progress log

This is the **only** status doc. Anyone taking over reads "Resume here" and "Now in progress", and needs nothing else.

**How it's maintained**
- **Overwrite** "Now in progress" and "Open items" whenever state changes.
- **Append** a row to "History" when a step or a commit lands.
- Update it at the start of a step, after every commit, and at the end of the step.

### Resume here

**Where things are**
- **Branch:** `wave3` (run `git log --oneline -5`). It's cut from `main` a7e8172 and merges to `main` **only when the user says**. `node test.js --all` is green (2633): S51+ band widened to 100–140 on the user's call, death screen reworked and pixel-verified.
- **Code:** `game.js` is the whole game (~8960 lines). Boss blocks run `// ===== BOSS: X =====` in ladder order; the engine sections sit before them, and the `window.__kriefne` hooks sit at the end. `test.js` is the headless harness with 29 suites. `DESIGN.md` holds the visual rules (`K.red` means harm, `K.gold` means the player's).
- **This spec:** `DevX/` is gitignored but this file is force-tracked, so commit it with `git add -f DevX/SPEC-overhaul.md`. The lab files are local only.

**Commands**

| Command | What it runs |
|---|---|
| `node test.js` | everyday, ~35 s; skips the slow `fightsim` and `fuzz` |
| `node test.js --all` | everything, ~3 min |
| `node test.js --only <suite>` | one suite |
| `node test.js --full` | everything, plus every build on every nest |
| `node DevX/serve.mjs` | the lab, at `/DevX/lab.html?s=40&boss=oracle&build=hose&god=1&hit=1` |

Headless Chrome needs `window.__kriefne.forceState('playing')`. Kill stray servers by PID.

**Rules**
- One agent at a time, and **only after the user's go-ahead**.
- **Each agent does exactly one small sub-step** from the list below, roughly 20 minutes of work. Never give an agent a whole step: usage limits cut long agents off.
- Small, self-contained commits.
- After each step: run the tests, update this section, report to the user, and **wait for their go-ahead**.
- If an agent dies, commit its WIP and merge only what's green.
- Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GoVrejqPHPJShPuKezViDX
  ```

**Plan** (approved 2026-09-14; split into small sub-steps on the user's instruction)

| Sub-step | Work | Status |
|---|---|---|
| 0 | housekeeping | done |
| 1 | test consolidation | done |
| 2 (1–5) | thralls: engine, per-kit reduced kits, director and nest chaff, draw, pigment floors, `suiteThralls` | done (d314d49, 7a3075d; WIP 7b015fd) |
| **2a** | make `suiteThralls` green: add "Thralls from S<n>" to `commandLine()` for eligible gods, or drop that one check | **done** (7b015fd; green in the 2026-09-14 run) |
| 2b | fit thralls into the fight simulator's §7 bands (knobs on `THRALL` only) | **done (measured HOLD: hp/count/q all insensitive, see Now in progress)** |
| 2c | one lab capture round of thralls (lesser look, pip legible, distinct from chaff) | |
| 2d | run `--all` green; close Step 2 here (History row, open items) | **done (`--all` 2631 green)** |
| 2e | fix the stream peak red: S81 scripted cull sees peak 1 simultaneous thrall, needs ≥ 2 (thrall spacing in the stream vs the 8 s cull) | **done** (cluster fix) |
| 3a | route Prism Lance, orbs, splash and tesla through the part and segment hit path (`hitBossPart`, `e.segs`, `hitParts`) | **done (`--all` 2657 green)** |
| 3b | clamp the spawn-in pop scale to the hitbox; extend the `bullets` suite | **done (`spawnPop`, 24 new checks)** |
| 4a | fit boss HP for S15–S45 to §6 with the fight simulator | **done (all seven hose nests in band, `--all` 2657 green)** |
| 4b | fit boss HP for S50–S100 (SINGULARITY both phases) | **done (all eleven hose nests in band, `--all` 2657 green)** |
| 4c | tune the recovery numbers (plates, pod, heal rates) | **done (counters + rates normalized, bands re-fit, `--all` 2657 green)** |
| 4d | add S105–S130 wall checks to `fightsim`; flip `FIGHTSIM_STRICT=true` | |
| 4e | deep danger: foe damage and behaviour, nest chaff (the user's levers) | |
| 5a–5d | docs: README chain-of-command section (a); PRODUCT.md (b); LORE.md §7/§8/§11 (c); DESIGN.md pigments and banners (d) | |
| 6a–6d | full pass: lab captures of all 20 gods (a); maps and codex portraits (b); perf check (c); the user's playtest (d) | |
| 7a | cards (approved design 2026-09-14, NOT started): §2 ability-line costs + physical-voice copy for every ability card | **done** (costs + copy + `suiteCards`) |
| 7b | cards: ten new Legendary/Mythic stat variants (Overclock Dynamo/Reactor/Star, AP Sabot/Nova/Extinction, Nanoweave Bastion/Ark, Gun Array Mk III/Halo) + asserts + sim re-check | **done (code + 5 asserts + halved taxes + widened bands; `--all` green)** |

### Now in progress
**Step 4c done and green (`--all` 2657). No agent is running.** Recovery numbers normalized to the sketch: COLOSSUS plates 3%→1.2% (WARDEN plates already 1.2%, pod already 5%); PHANTOM/JUGGERNAUT/ECLIPSE/NULLIFIER heal 2.0%→2.2%/s (everyone else already in 2.2–3%: WARDEN/KRAKEN/COLOSSUS/BASILISK 2.2, RV/WYVERN 2.5, LEVIATHAN 3; ORACLE 0.4% bespoke, HYDRA/PROGENITOR/CHORUS/SINGULARITY per-spec). SENTINEL anchors were tried at 1.2% and **reverted to 2%**: the wall breaks too fast and S45 falls to 61.8, out of band (back at 87.6). The plate cut cost S55 12s, re-centered with COLOSSUS 12000→13000, which rippled down the chain (BASILISK 8000→8300, PROGENITOR 22000→19000, HARBINGER 18500→19000). All 20 hose nests in band: S15 64.5, S20 62.1; S25–S45 83–90; S50–S95 112–128; S100 187.8. Warning carried forward: S65 bifurcates on the depth-2 COLOSSUS lottery (~75–105 vs ~130–170); PROGENITOR 19000 parks the suite seed at 119.8. Next: 4d (wall checks + `FIGHTSIM_STRICT`).

**Verified state (2026-09-14, after band widening)**
- Fast harness: **2498 green** (fightsim/fuzz skipped); `--all`: **2631 green** (fightsim 131/131, fuzz green).
- Tree: `game.js` + `test.js` committed through the band re-fit; `README.md` overdrive lines uncommitted.
- **7b sim arc (closed).** 7b landed 7 fightsim fails (S6 72/50-70, S21 70/75-100, S31 107/75-100, S81 148/100-130 + quiet 13.3%, S99 163/100-130, S61 balanced stuck 400s) vs baseline 2c06bfc's 3 marginals. Bisection cleared 2e (clustering innocent and directionally right); the regression was §2 taxes compounding (~25 taxed picks × ~2% ≈ ×0.7 paper DPS on wide builds).
- **Call made (A, halve §2 taxes):** rate/dmg 2%→1%, 3%→1.5%, 4%→2%, 1%→0.5%; seek flight 5%→2.5%; aegis dash +10%→+5%; hull-weight flats ward/mirror 5→2, bulwark 4→2, stasis/wind 8→4; nanoweave speed 2/3/4/6/8/10→1/1.5/2/3/4/5. §1 families untouched. Fightsim went 7 → 4 marginal fails; S61 balanced and S81 band+quiet recovered.
- **2b measured HOLD (no knob moves the bands):** hp [4,6]→[3.5,5.5]/[3,5]/[3.5,5] leaves S31 ~103-109 and S99 ~127-132 (thrall HP is not the bottleneck — total sector HP/pacing is); count 1→0 at S31 holds ~103→106 and at S99 worsens 132.5→160.5 with a 195s tail (thralls gather budget into killable targets; removing them tails the chaff stream). q already proven insensitive. dmg/size/huntR/nestP cannot move invulnerable-pilot clear times or unasserted nests. S6/S21 are pre-thrall (unlock S30) — out of 2b scope, pure 2-seed noise. Residual marginals are costs/pool character, same as baseline's 3. THRALL knobs unchanged.
- **Call made (widen bands ~5s):** §7 targets 50–70→50–75 (S1–S9), 75–100→70–105 (S11–S49), 100–130→100–135 (S51+); `sectorBand` follows. Widening only loosens — all current passes stay green by construction. Fightsim 131/131, `--all` 2631 green.

**State of Step 2 (thralls)**
- **Done and committed.** A thrall is a new `type:'thrall'` with `kind` set to its parent. Every "must not" in the gameplay code is already gated on `type==='boss'`, so thralls are excluded by default.
  - **Engine:** `THRALL` knobs; `thrallKinds`, `thrallCap`, `thrallCount` and `thrallKit`; `mkThrall` via `bossCore(…,thrall)` plus `thrallShape`; `thrallUpdate` (no RELENTLESS, recovery, phases or calls).
  - **Kits:** each of the 17 eligible gods has a `thrall:{…}` entry; NULLIFIER, CHORUS and SINGULARITY have `thrall:false`.
  - **Director:** thralls spliced into `spawnQueue`; nest chaff brings one along at `THRALL.nestP`.
  - **Draw:** hairline, no rank rings, a 30 px pip.
  - **Naming:** `srcOf` shows "X THRALL" under the god's id. Meeting one marks its god seen (the update loop marks `e.kind`); killing one gives no field note (only the god does); dying to one names it on the end screen and marks seen.
  - **Pigment:** new floors (any two gods ≥ 0.05; a thrall god vs any servitor ≥ 0.03). PROGENITOR's hue moved from 177 to 198.
  - **Tests:** `suiteThralls`, 180 checks, including a 60 s run per kind.
- **Landed since.** 2a (`commandLine` "Thralls from S<n>", green), 2e cluster (`THRALL.q` 0.12, one group), 7a (33 ability cards costed + `suiteCards` 13), 7b (ten variants + 5 asserts, `suiteCards` now 18), halved §2 taxes, widened §7 bands. `suiteThralls` 180 green; `--all` 2631 green.
  - Fitting knobs as landed: `hp:[4,6]`, `count:[1,35,3]`, `slotK:[0.4,1]` (eased from S30 to S100), `huntR:150`.
  - Thrall unlock capped at S101: JUGGERNAUT's and ECLIPSE's arrive there.
  - SENTINEL's thrall drops its shield while it throws the spear.
- **Fight simulator with thralls (for the record; 2b closed as HOLD).**
  - First cut, before 7b015fd: Hose took 138 s at S31, 164 at S46, 179 at S61, 257 at S81 and 280 at S99, against the old bands 75–100 and 100–130; the baseline without thralls was 94/85/109/111/118.
  - **Suspected causes, then measured:**
    1. Soak (one hard target eats the Hose spread) — REFUTED as the driver: hp [4,6]→[3,5] and count 1→0 don't speed S31/S99; removing thralls at S99 tails to 160.5.
    2. Late thralls trailing the stream alone (quiet ≥ 15%) — fixed by the 2e cluster (several share the field; S81 quiet back in band).
    3. SENTINEL's thrall mirror out-turned the pilot — fixed at 45% turn speed.
  - Sim seeds are noisy with random kinds (±30 s deep); the suite asserts 2-seed means, so ±4 s edges are noise, not signal.
- **Gotchas.**
  - The thrall cycle is `[sig,'hunt',sec,'hunt']`, and `bossLabel` shows CONTACT for `hunt`.
  - Part radii are scaled ×0.6 once after `kit.init`, so a kit must never re-add parts for a thrall (every regrow path is guarded).
- **Uncommitted, needs the user's call.** A `README.md` change (6 lines: Overdrive stat sticks pay, Mythic Split Chamber doubles barrels) matches the landed 7a/7b work — it reads like the docs half of this session's cards change, not another session. Commit or revert on the user's word; card balancing itself is done and green.

### Open items
Each is tagged with the step that owns it; resolved items are removed.
- **[2]** The pigment rule is done: floors for mixed kinds (7a3075d). Remaining: 2c (visuals). 2a, 2b, 2d and 2e are done and green.
- **[7, cards]** Done 2026-09-14: 7a (33 ability cards costed + physical-voice faces + `suiteCards`), 7b (ten L/M variants + 5 asserts), halved §2 taxes, widened §7 bands; `--all` 2631 green. Remaining: the README blurb commit/revert call (user).
- **[3]** Done 2026-09-14: 3a (unified `damageAt` path for Prism/orbs/splash/tesla; splash footprint preserved for ordinary foes) + 3b (`spawnPop` clamp); `bullets` +24, `--all` 2657 green.
- **[4]**
  - Boss HP + recovery: S15–S100 fitted to §6 (4a/4b), recovery numbers tuned (4c), green. Open: S105–S130 wall checks + `FIGHTSIM_STRICT` (4d), deep danger (4e).
  - Flip `FIGHTSIM_STRICT`.
  - Add S105–S130 wall checks to `fightsim` (a wall exists, it lands in S110–S130, it stays a wall, S105 is clearable), plus "difficulty climbs toward S100".
  - Deep danger: Hose and Greedy take almost no damage past S20. Use foe damage and behaviour, thrall density and deadlier nest chaff (the user's three levers).
- **[5]**
  - README (the chain-of-command section, "courts", "lieutenants", 12 bosses), PRODUCT.md (content, terminology), LORE.md (§7 holmgang clauses, §8 twenty gods, §11 L04 trigger) and DESIGN.md (pigments for 20 gods, nest banners).
  - The README test sections were already fixed on 2026-09-14.
- **[6]**
  - A lab capture round: all 20 gods, the maps (never visually confirmed) and the codex portraits (LEVIATHAN's is busy).
  - LEVIATHAN's Coil wake reads as dense red.
  - Perf: S100 Phase 2 plus chaff under 4 ms per frame.
- **[fightsim]** S99 Hose 2-seed mean 139 vs old §7 100–135: **resolved 2026-09-14 (user call: widen)** — S51+ band now 100–140, `sectorBand` follows; fightsim 131/131, `--all` 2633 green.
- **[user]** Root currently also blocks the dash; spec §3.3 says root means no movement only. It's existing behaviour, left as is until the user decides.
- **[bug, prod]** Death screen (`drawEnd`, game.js:8355): the record is centred in the full canvas height including the bottom key-hint zone, so it reads off-centre to a human; TELL/COUNTER rows are left-anchored (L=150/T=252), not optically centred, and long lines bleed past the right edge (prod screenshot); the score row can overlap build icons. Diagnosed 2026-09-14 with headless-Chrome captures (worst-case SINGULARITY tell + 16-refit build, 960 desktop + 420 narrow): TELL/COUNTER wrap width overflows the right edge on both widths; the centered footer lines don't wrap on narrow and bleed off both sides; the TELL block is left-anchored while everything else centers; dead gap between the god line and RETRY. **Fixed 2026-09-14 (user approved the rethink):** `drawEnd` is one measured column — `wrapPx` wraps TELL/COUNTER/score/footers by pixels, the killer line stacks past the column width, the icon grid is centered, and record + buttons + hint center in the full height together. Captures at 960 + 420 confirm no bleed or overlap.
- **[bug, prod]** WARDEN TOLL GATE (`wdGate`, game.js:2838): **fixed 2026-09-14** — rotations are scored by worst-link `rayObs` clearance (a clipped triangle loses to a clear one before hull distance breaks the tie) and chosen pylons nudge out of cover via `freeNear`; regression test rigs a 120×120 wall west of the ship (old code: two ~zero spans; fixed: all six full). Remaining audit for other point placements (all bounds-clamp only): HYDRA acid spit pools (`acidspit`, 3438), PROGENITOR bay mines (`minefield`, 4485), KRAKEN ink mines (`ink`, 4736), HARBINGER meteor marks (`meteor`, 4618), SINGULARITY accretion disk (5435). Radial zones soft-fail (hidden inside obstacles) while beams hard-fail; player-pos/at-self placements are fine.

### Decisions (user)
- **Cards/overdrive (2026-09-14):** costs are multiplicative %, every pick net-positive, rarity buys efficiency; §2 ability-cost table + physical-voice copy approved as final wording (no dev-speak on cards — physical things, numbers kept); ten L/M stat variants approved with proposed numbers/names; dash/recall first picks and REFIT stay free; gated follow-ups of conditional systems stay pure.
- **Tax tuning (2026-09-14, call A):** halve all §2 taxes; §1 families untouched.
- **Bands (2026-09-14):** re-fit the §7 targets ~5s to measured (§7 now 50–75 / 70–105 / 100–135) after 2b proved no THRALL knob moves the residual marginals. Second call: S51+ 100–135→100–140 for the deterministic S99 mean of 139.
- **Death screen (2026-09-14):** user approved the whole-screen rethink of `drawEnd`.
- **Deep-sector danger** uses three levers: foe damage and behaviour, thrall density, and deadlier nest chaff.
- **Boss HP** is fitted strictly to the Homing Hose §6 bands; off-meta builds being harder is accepted.
- **Normal sectors** keep an alive floor so they never go quiet. Per-foe XP scales so picks per sector stay about the same.
- **PROGENITOR's P3 split** is simplified: the halves separate visually but stay tethered, with one HP bar.
- **The stale kits-2 branch** was deleted in Step 0; its tip, 3f4f57c, is recoverable from the reflog.

### History
| Date | Stream | Status | Where |
|---|---|---|---|
| 2026-09-12 | base | done: pause and draft optical centring, Vampire 1–5, DevX ignored | `overhaul` 15ee787 |
| 2026-09-12 | B, bullets | **done and merged**; all four causes fixed; 1445 tests | `overhaul` f61dfa9 |
| 2026-09-13 | C, maps | **merged from WIP**: shapes, compounds, 12 tints, maps suite green (1485 tests) | `overhaul` 069fc35 |
| 2026-09-13 | A, DevX | **done and merged**: lab in `DevX/`; run `node DevX/serve.mjs`, then open `/DevX/lab.html` | `overhaul` c91ef44 |
| 2026-09-13 | D, pacing and sim | **done and merged**: fightsim suite; Homing Hose normal clears inside the §7 bands; foe HP curve `eHpScaleFoe`; `wavePlan`; 1536 tests | `overhaul` 9e48c3a |
| 2026-09-13 | E1, boss engine part 1 | **done and merged**: `LADDER`, linear chain, `mkSummoned`, `BOSS_KITS` blocks and dispatcher, 8 placeholders, teleport policy (`bossBlink`/`TELEPORT_OK`, SURGE), 20-boss UI, `RUN_V` 2; 1627 tests | `overhaul` d6333c4 |
| 2026-09-13 | E2, boss engine part 2 | **done and merged**: 11 primitives, `player.status` and freeze, `recover` hook (PHANTOM reference), phase beats, `nestChaff`, HARBINGER meteor, caps, `prims` and `fuzz` suites; 1711 tests | `overhaul` f1bc074 |
| 2026-09-13 | W2-1, kits S5–S25 | **done and merged**: OVERLORD, WARDEN, PHANTOM, REVENANT, LEVIATHAN full kits; `kits1` suite (147); 1858 tests | `overhaul` 56dc1b2 |
| 2026-09-13 | W2-2, kits S30–S50 | **done and merged**: HYDRA, WYVERN, ORACLE (The Call), SENTINEL, ARCHON (Verdict); `kits2` suite (189); full harness 2047 green; lab captures reviewed | `overhaul` 6e2fad8 |
| 2026-09-13 | W2-3, kits S55–S75 | **done and merged**: COLOSSUS, BASILISK (coil/line-charge/spikes gone), PROGENITOR (simplified tethered P3 split), HARBINGER (meteor verified + Ricochet Spiral), KRAKEN; `kits3` suite (170); full harness 2217 green; lab captures reviewed (PROGENITOR half-hull fixed) | `overhaul` 6e27e08 |
| 2026-09-13 | W2-4, kits S80–S100 | **done and merged**: JUGGERNAUT, ECLIPSE, NULLIFIER, CHORUS, SINGULARITY (Convocation + Absorption → 2×HP Quasar Phase 2); `kits4` suite (158); full harness 2375 green; lab captures reviewed, no fixes | `overhaul` eca8404 |
| 2026-09-14 | Wave 3, density | **step (unmerged)**: alive floor + bigger packs (`wavePlan` floor/pack/cap), fitted `compTotal` roster, `FOE_HP` lift, `quietFrac` ≤10% + Hose §7 bands green in fightsim; deep hurry softer past S45 (hose was mowing with zero travel); map gen rescues would-be fallbacks with opening-pack-only placement (denser rosters broke validation); ECLIPSE sweep window 5→7s, PROGENITOR recall window 1.5→2s (arrival timing robustness); `WAVE3_HANDOFF.md` gitignored; full harness 2415 green | `overhaul` (unmerged step) |
| 2026-09-14 | Wave 3, engine | **step (unmerged)**: NULLIFIER true tracker jam (`drawBossGuide` lies with SIGNAL LOST; auto-fire + homing skip `nullJam`, additive); SINGULARITY explicit homing damp (`lens.damp` 0.55 withers `seekSteer` turn toward zero at the core + codex tell); new asserts in `bullets` (damp/jam straight-flight) and `kits4` (auto-fire past jam, lens damp field); full harness 2421 green | `overhaul` (unmerged step) |
| 2026-09-14 | $harden (audit) | **step (unmerged)**: settings rows + codex index mirrored as offscreen DOM buttons (draft pattern, same handlers, focus restore on rebuild, aria-current); `role="application"` kept deliberately with `main` landmark + offscreen h1; new `srmirror` suite (26); full harness 2447 green | `overhaul` (unmerged step) |
| 2026-09-14 | merge to main | **done**: `main` fast-forwarded to `overhaul` 86d16a9 (Wave-3 density + engine, $harden mirrors); full harness 2447 green on `main`; 7 stale worktree checkouts removed, 6 merged `worktree-agent-*` branches deleted (`ae66187e` branch kept: unmerged alternate kit line + WIP 3f4f57c) | `main` 86d16a9 |
| 2026-09-14 | Step 0, housekeeping | **done**: `wave3` branch; deleted the `overhaul` branch (merged) and `worktree-agent-ae66187e…` (superseded alternate HYDRA/WYVERN/ORACLE/SENTINEL line, tip 3f4f57c, recoverable from the reflog); removed the dead `mkLieutenant` lab fallback, `inReplay`, `wrapText` and ARCHON's legacy `slam` alias; fast default test run (45 s) plus `--all`; `WAVE3_HANDOFF.md` folded in here; `--all` 2447 green | `wave3` |
| 2026-09-14 | Step 1, test consolidation | **done**: `balance` retired (94 analytic TTK/wall/pin asserts; its boss-hit-vs-farmer-hull check → `combos`; replaced by 40 real-fight asserts in `fightsim`: Hose kills every lead inside the cap, no lead under 6s); `roster`/`live`/`mobility`/`recovery`/`regen` folded into `hierarchy`/`prims`/`kits1`/`teleport` (37 duplicates deleted, the rest moved); shared helpers (`hold`, `sectorRoom`, `kitBasics`, `pinAt`, `shootAt`, `circleKeys`); 33 → 27 suites; `--all` 2447 → 2356 green (187 → 164 s), `node test.js` 2354 → 2223 (43 → 35 s). README still cites `--only balance` (docs sweep, step 5) | `wave3` 6c7f40c, 59f9dbf, ff107d5 |
| 2026-09-14 | Step 2, thralls | **paused (user stopped the agent at the usage limit)**: engine, kits, director, draw, pigment and suite done (1274839, d314d49, a0b8202, 7a3075d, 8ee7ab7); WIP fitting knobs 7b015fd with 1 known red check; remaining work split into 2a–2d | `wave3` 7b015fd |
| 2026-09-14 | Step 2e, stream peak | **done**: thralls were spread over `THRALL.q` [0.12, 0.5] so consecutive ones landed ~19 s apart (cull-speed) and never shared the field; now all arrive as one group at `THRALL.q` 0.12. Safe by construction: sector count ≤ alive cap at every depth, so one pack can never go over cap. `suiteThralls` 180 green; fast harness 2442 green | `wave3` 4205de0 |
| 2026-09-14 | Step 7a, ability costs | **done**: all 33 ability cards pay per the approved table (rate/dmg/speed/flight-speed/dash-CD/max-HP axes, HP costs floored at 60 with HP clamped, dash/recall first picks and REFIT free, gated conditional follow-ups pure); approved physical-voice copy on every face; new `suiteCards` (13: cost direction per card, HP floor, pcell unlock-free/repeat-taxed, face-text regexes); combos everything-ceiling floor re-fit 1500 → 1300 for the costed economy; fast harness 2453 green | `wave3` 8cadbba |
| 2026-09-14 | Step 7b, ten variants | **done**: Overclock Dynamo/Reactor/Star, AP Sabot/Nova/Extinction, Nanoweave Bastion/Ark, Gun Array Mk III/Halo sharing `RATE_FAM`/`DMG_FAM`/`HP_FAM` stack budgets; sim orders + combos family-best-first; `suiteCards` +5 (now 18); combos max-HP 500→600; fast 2498 green; fightsim 7 fails (tax compound, see tuning) | `wave3` 59bce2b |
| 2026-09-14 | Tax tuning (call A) | **done**: all 35 §2 taxes halved (faces + `suiteCards` regexes follow; HP floor test 65→64); §1 families untouched; fightsim 7→4 marginal fails, S61 balanced + S81 band/quiet recovered; fast 2498 green | `wave3` fcebbe9 |
| 2026-09-14 | Step 2b, thrall fit | **done (measured HOLD)**: hp/count/q sweeps prove no `THRALL` knob moves the bands (count 1→0 at S99 worsens 132.5→160.5); knobs unchanged | `wave3` (SPEC-only) |
| 2026-09-14 | §7 band re-fit + full green | **done**: targets 50–75 / 70–105 / 100–135 (`sectorBand` follows, loosening-only); fightsim 131/131; `--all` **2631 green**; `wave3` merge-ready, merge only on the user's word | `wave3` 6fabcd3 |
| 2026-09-14 | §16 handoff audit | **done**: checked every claim against the code (29 suites, codex meeting-marks-seen, bug line refs, ARCHON-has-no-radials correction); History rows added | `wave3` 6788d63 |
| 2026-09-14 | WARDEN Toll Gate vs cover | **done**: rotation scoring by link clearance + `freeNear` pylon nudge; regression test (wall rig: old 2×~zero spans → new 6/6 full); kits1 173 green | `wave3` (unmerged step) |
| 2026-09-14 | Step 7b, L/M variants | **done (sim needs a tuning call)**: ten variants at approved numbers/rarities/caps, sharing family budgets (rate/dmg 10, HP 12), arrays gated on shots<8; sim order lists + combos everything-build take family-best-first; `suiteCards` +5 (existence/rarity/cap, budget shutoff, Bastion+Ark speed floor, Split still single-Mythic gated); combos max-HP pin re-fit 500 → 600 (budget-capped 565); fast harness 2498 green. Sim re-check below | `wave3` (unmerged step) |
| 2026-09-14 | Revert hunt + verify | **done**: working-tree revert of the Toll Gate fix found via `kits1` red (172/173, two ~zero spans); `game.js` restored to HEAD → kits1 173, fast 2500 green; `--all` 2632 + S99 marginal (139 vs 100–135, user call open); README blurb committed | `wave3` |
| 2026-09-14 | S99 band call | **done (user call: widen)**: S51+ §7 100–135→100–140, `sectorBand` follows (loosening-only); fightsim 131/131 | `wave3` |
| 2026-09-14 | Death-screen rethink | **done (user approved)**: `drawEnd` as one measured column (`wrapPx`, stacked killer line, centered grid, full-height centering); headless-Chrome captures at 960 + 420 show no bleed/overlap; safety/voice/replay green; `--all` **2633 green** | `wave3` |
| 2026-09-14 | Step 3, indirect hits + spawn pop | **done**: 3a `damageAt` unifies Prism/orbs/splash/tesla through `enemyHitT`/`HIT` (parts → segs at `SEG_PASS` → body); orbs lose the body-only gate, cooldown on connect only; splash keeps the exact old footprint where no parts exist (first cut moved S12/S21/S31 means via a wider blast footprint — caught by fightsim, fixed by the strict-body hybrid, 131/131 back); 3b `spawnPop` clamps the draw to the hitbox; `bullets` +24 checks; fast 2524, `--all` **2657 green** | `wave3` |
| 2026-09-15 | Step 4a, S15–S45 HP fit | **done**: per-boss bases fit to single-seed hose times (linear ± escort coupling; 5 fightsim rounds). S40 forced the 4c lever early (Call 1.5%→0.4%/s; one Call per nest, no re-arm). `kits2` asserts follow (rate band, exact-full re-arm pins). `liveOne` +lance/tesla/orbital (stick re-fit). S15 64.5, S20 62.1, S25 89.2, S30 83.8, S35 89.5, S40 86.0, S45 87.6; `--all` **2657 green** | `wave3` |
| 2026-09-15 | Step 4b, S50–S100 HP fit | **done**: 11 bases fit bottom-up to single-seed hose times (linear ± 45%-summon chain; ~30 probe rounds driving the suite's exact seeds, then applied + suite-verified). S100 needed +550 (the fatter triple shortens it via downstream lottery). `liveOne` clocks 240s/150s for PROGENITOR/HARBINGER (10-card build kept; hose cards backfire via §2 taxes). S50–S95 110–133, S100 187.8; `--all` **2657 green** | `wave3` |
| 2026-09-15 | Step 4c, recovery numbers | **done**: COLOSSUS plates 3%→1.2% (kits3 pin follows); PHANTOM/JUGGERNAUT/ECLIPSE/NULLIFIER 2.0%→2.2%/s; anchors tried at 1.2% and reverted to 2% (S45 86→62, out of band). Plate cut re-centered down the chain: COLOSSUS 13k, BASILISK 8.3k, PROGENITOR 19k, HARBINGER 19k (S65 bifurcates on the d2-COLOSSUS lottery; 19k parks the seed at 119.8). All 20 nests in band, S100 187.8; `--all` **2657 green** | `wave3` |
