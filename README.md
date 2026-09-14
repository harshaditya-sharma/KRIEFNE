# KRIEFNE — Roguelite (endless)

Small polished top-down action roguelite, set in deep space: you are KRIEFNE, a machine exploration ship,
fighting alien machine ships ranked like Norse gods. Vanilla JS Canvas, zero dependencies, zero assets, zero API keys.
The story and setting live in [`LORE.md`](LORE.md).
Endless: fight down a galaxy trail of sectors that grow larger, denser and meaner forever, through a
twelve-boss chain of command that tops out at the Apex in S100 — and a run that is meant to end not long after.

## Run it

**Double-click:** open `index.html` in Chrome/Edge (favicon is inline, no 404s).
The game is a single classic `<script>` on purpose — ES modules would break `file://`.

**Local server (recommended):**
```powershell
cd C:\Users\Harshadityasharma\development\kriefne
python -m http.server 8000
# open http://localhost:8000
```

## Controls

- **WASD / Arrows** — move (the ship's nose follows your movement; guns track the mouse) · **Mouse** — aim
- **Hold Click** or **AUTO-FIRE (default ON)** — shoot · **T** — toggle auto-fire
- **Space / Shift** — dash, **locked until Ion Thrusters** (the first stack unlocks it; further stacks
  cut dash cooldown). Move speed is a separate **Slipstream Coils** line (+10%/stack, offered once dash
  is unlocked).
- **E** — context portal key: on the EXIT ring (or click it) = next arena (always works).
  Recall is a **usable item**: **Portal Cell** cards grant charges (max 5, start at 0).
  **E** with no gate drops one (1 charge). **E** far from the gate channels a blink
  (cast bar ring, cancellable with **E**, 520px max range shown by the tether, then cooldown).
  **E** next to your gate moves it for free. Gates reset each arena; charges persist.
- The first level-up of every run **always offers both unlocks** (thrusters + portal cell + one random).
  Pass on either and it keeps coming back: once it has been missing from 3 drafts in a row it returns
  as a **fourth card** marked "offered again", under the usual three, never replacing one of them.
- Mouse picks land on **release**, on the card the press began on, and a draft ignores the mouse for
  300ms after it opens, so a click meant as a shot never picks a card. **C** and **H** open the codex
  and help from a draft and return to the same cards. Each card shows how many you already own
  (`OWNED 2 OF 10`) and what it does to this hull (`DMG ×1.52 → ×1.82`), computed by applying the
  card to a copy of the ship.
- **1 / 2 / 3 (4) or Click** — choose upgrade · **Esc / P** — pause · **Q** (paused) — quit to title
- **C** — codex (title, galaxy hub, pause, a draft, or mid-fight) · **H** — help · **O** — settings · **M** — mute · **R** — restart (press twice: it abandons the saved run)
- **Enter** — start, or **continue** a saved run · **N** — new run (press twice when a run is saved)
- Switching tabs or alt-tabbing **auto-pauses** (shows AUTO-PAUSED; resume with Esc/click).
  Three paths catch it — `visibilitychange`, window `blur`, and a 250ms `hasFocus()` watchdog —
  because alt-tab can stall rendering *without* hiding the page. Pausing paints one frame
  synchronously and clears held keys.

### Status effects

- **PETRIFIED** (BASILISK gaze) roots you in place for 1s.
- **JAMMED** (NULLIFIER field) locks dash and recall for as long as you stand in it.

Neither ever takes away your guns — being unable to shoot is not a mechanic, it's waiting.

## Loop

1. START drops you on the **galaxy hub** — pick a lit sector node (`Enter`/click/`←→`), clear it, come
   back, pick the next unlocked one. Cleared sectors can be flown again, but only as a **replay**:
   a drill that counts for nothing. The hull goes in exactly as it is (say 100/125 HP) and comes back
   exactly as it went in (100/125, whatever happened inside). No gems drop, XP never banks, nothing
   levels, no draft opens, and a replayed nest banks no boss damage. The EXIT, quitting, and losing
   the hull all end a replay the same way: back on the hub with the pre-replay hull, and the hub says
   what it restored. Codex entries still unlock. The HUD reads `REPLAY` and `NO XP` throughout.
2. Drop into a procedurally generated themed sector — larger than the viewport with a smooth-follow
   camera, growing every sector from 1200×880 up to 2400×1600 (seed shown in pause when enabled).
3. An opening pack materializes on load (6 in S1, growing with depth); reinforcements stream in
   from off-screen as the round progresses — faster, in bigger packs (up to 4), against a higher alive
   cap (8 → 16) the deeper you go.
   Kill everything (alive + queued = FOES in HUD) → grab XP gems → level up → pick 1-of-3 upgrades.
4. The EXIT gate lands near you (250–550px, never on top) and fires a tapered beacon column;
   an engraved off-screen marker always points the way. **XP is collected, never handed out:**
   gems stay where they fell when the sector clears. Fly over them, or pull them in with Magnet
   Core / Tractor Core (a Magnet Core pick vacuums the whole field). Once the foes are gone the HUD
   counter switches to `XP ON FIELD n`; anything still lying there when you take the EXIT is gone.
5. Every 5th sector is a boss **NEST** — see the chain of command below.
6. Die = **HULL LOST** (score + depth banked). The end screen names what brought the hull down and
   the blow (every hostile round, ring and field is stamped with its maker), shows that foe's TELL and
   COUNTER, the build as it stood, NEW BEST, and the next god on the trail. `R`/`Enter` retry once the
   screen has settled (600ms); Space, which is dash, never skips it.
7. **The run is saved** (`kriefne_run` in localStorage) every time you reach the hub or enter a
   sector, so closing the tab, reloading, or quitting to the title never ends it — only death does.
   The title then offers **CONTINUE**, which lands on the hub at the sector you were on. Progress
   made *inside* a sector is not saved: quitting mid-sector replays that sector from its start, so
   a reload can never duplicate XP, drafts or kills.
8. Persistent across runs: best score, deepest sector, total boss kills (each = permanent +2%
   damage), and codex progress.

## The chain of command (12 bosses)

Bosses hold ranks, and rank decides who can summon whom.

| Rank | Bosses |
|---|---|
| **APEX** | SINGULARITY |
| **SOVEREIGN** | ARCHON · JUGGERNAUT · NULLIFIER · CHORUS |
| **LORD** | LEVIATHAN · ORACLE · BASILISK · HARBINGER |
| **CAPTAIN** | WARDEN · PHANTOM |
| **ENFORCER** | OVERLORD |
| *chaff* | drone · mite · stalker · sniper · tempest · brute |

Rank names are chosen so they never collide with a boss name.

**The rules** — all derived from `BOSSDEF`, never written down twice:

- **Every boss debuts alone**, at the nest listed below. Its `debut` field is the single source of
  truth: the schedule, the hub lore and the codex all read it.
- **Any other nest is a court:** a commander from the top two ranks you have met, escorted by its
  *own* subordinates — one rank below first, stepping further down only when that rank runs out.
  No two consecutive nests share a roster. Courts are seeded per sector, so the trail is the same
  every run.
- **A boss can call a lieutenant** — a weakened boss from exactly **one rank below it**, and only a
  kind you have already met. A lieutenant can call one of its own if command depth allows.
- **Signature nests** override the derivation for set pieces: S5 (lone OVERLORD), S50 (the first
  Sovereign), S100 (the Apex, commanding three links deep).

**The cascade is bounded by four structural limits**, so summoning can't snowball:

| Sector | Command depth | Lieutenant budget (whole nest) |
|---|---|---|
| S1–S30 | **0** — nothing can summon a boss | 0 |
| S31–S60 | 1 | 2 |
| S61–S100 | 2 | 3 |
| S100 | 3 (signature) | 3 |
| S101+ | 3, rising | 4, rising |

Plus: at most **2 lieutenants alive at once**, and lieutenant HP decays by chain depth —
**22% / 4.8% / 1.1%** of a full boss at links 1 / 2 / 3. Lieutenants never recover and don't bank the
permanent damage bonus. CHORUS echoes are its own mechanic and don't count against the budget.

**The trail** (generated by `bossKindsFor`):

| Nest | Court |
|---|---|
| S5 | OVERLORD |
| S10 | WARDEN |
| S15 | PHANTOM |
| S20 | PHANTOM + OVERLORD |
| S25 | WARDEN + OVERLORD |
| S30 | LEVIATHAN |
| S35 | LEVIATHAN + WARDEN — *lieutenants begin* |
| S40 | ORACLE |
| S45 | WARDEN + OVERLORD |
| S50 | **ARCHON** |
| S55 | ARCHON + LEVIATHAN |
| S60 | BASILISK |
| S65 | LEVIATHAN + WARDEN + PHANTOM |
| S70 | HARBINGER |
| S75 | ARCHON + HARBINGER + LEVIATHAN |
| S80 | JUGGERNAUT |
| S85 | BASILISK + PHANTOM + WARDEN |
| S90 | NULLIFIER |
| S95 | CHORUS |
| S100 | **SINGULARITY** |
| S105 | SINGULARITY + CHORUS |
| S110 | SINGULARITY + ARCHON |
| S115+ | full courts of three to four, rotating |

- **OVERLORD** — brawler. BURST / SUMMON / CHARGE / SWEEP. Never recovers.
- **WARDEN** — siege fortress. Spirals, guards, seismic slams, twin staggered waves.
- **PHANTOM** — blink skirmisher. Bolt fans, teleports, a locked LASER line.
- **LEVIATHAN** — segmented serpent. Burrows and resurfaces under you; the body hurts.
- **ORACLE** — zone controller. Three orbiting **WARDS** soak 75% until broken.
- **HARBINGER** — bullet-hell caster. Rotating walls with one gap; targeted meteors.
- **BASILISK** — controller. A telegraphed gaze cone **petrifies**; lunges leave spikes.
- **JUGGERNAUT** — ram. Armoured prow takes 40%; the **rear vent takes 190%**. Facing locks while charging.
- **NULLIFIER** — disruptor. Drops a field that **jams** dash and recall.
- **CHORUS** — splitter. Fractures into synced echoes at 66% and 33%.
- **ARCHON** — commander. Calls Lords twice as often as any other boss calls anything.
- **SINGULARITY** — apex. Drags you inward while debris arcs out; its Sovereigns call Lords, and
  those Lords call Captains.

### Boss recovery is budgeted

Recovery is a scripted beat, not a timer:

- **At most twice per boss**, for the whole fight.
- Triggered by crossing an **HP threshold** (66%, then 42%), never below 30%, never in the first 12s.
- Minimum 30s apart.
- Each one restores at most **6% of max HP**, drawn from a fixed pool — so a long recovery heals
  no more than a short one. Lifetime healing is hard-capped at **12%**.
- **No passive out-of-combat regen**, so a boss can never be worn down, flee, and heal back up.
- A **PHASED** boss absorbs rounds at 30% damage — mitigated, never bullet-transparent.
- Bosses that wedge in geometry or kite too far **reposition** visibly, and an off-screen boss tracker
  means you can never lose one.
- Any fight running past 180s makes the boss **RELENTLESS** — no further recoveries.

All bosses enrage below 30% and surge one desperate wave the first time they cross it.
HEAVY attacks are only blocked by **Crit Ward**; everything else is stopped by any shield.

## Validated procedural generation

Every sector is rule-bound and playability-tested at generation time, with two separate guarantees:

- **Connectivity ≥ 0.55** — BFS on a 40px grid (obstacles inflated by player radius). Player spawn,
  **all** enemy spawns and the EXIT portal must be reachable.
- **Open space ≥ 0.45** — at least 45% of the floor is walkable, so a sector can never generate as a
  solid maze.
- Up to 40 seed retries, then an open-field fallback. Seed + theme shown in-world and pause.

Obstacles are **rects, circles and convex polygons** — hex pylons, wedges, octagonal bunkers,
trapezoids and rotated girders.

Six layout archetypes, shuffled once per run by seed and dealt by sector, so a run cycles through all six:
**debris** (jittered grid of hull plates) · **arena** (open duelling floor, pillar ring, rim bunkers) ·
**corridors** (girder lanes with gaps, sometimes diagonal) · **bastion** (heavy bunkers + scatter) ·
**spokes** (radial avenues) · **scatter**.
Boss nests always use **arena** — a large body cannot wedge on terrain that isn't there, and bosses
drop on a clear ring around the centre rather than in a corner.

6 themes (Relay Drift · Archive Reef · Broken Ring · Slag Belt · Hull Ossuary · Rose Veil) change
the light (one star per sector, which sets the hatching direction and a slight tint of the dark,
the wreckage and the motif: steel, teal, sage, umber, ash-lilac, rose), the motif, bass pattern,
lead motif and tempo.

Colour has one meaning each: **gold** is KRIEFNE and its instrument, **red** is harm (every round,
blast, beam, field and tell, and any hostile in the moment it commits), **hydrogen blue-white** is
salvage, **bare metal** is wreckage. Every servitor and every god has its own muted **pigment**
(`PIGMENT_DEF`), always quieter than gold and red, so a mixed wave or a court reads as kinds at a
glance. Unmet gods show no pigment on the chart or in the codex. XP gems are the record's hydrogen
mark (two linked circles), so no hull can pass for salvage.
Generative WebAudio: ambient title theme, per-arena bass + lead, sparse pause theme, win/lose stingers.

## Settings, Help and Codex

- **Settings** (O): screen shake, particles, music, auto-fire default, seed display, wipe records,
  music + SFX volume, damage numbers — all persisted.
- **Pause** shows the hull as it stands: its refits (with stack counts) on the left, its systems
  (hull, damage, rate, shots, crit, speed, magnet, boss bonus) on the right. The hub shows the build too.
- **Help** (H): `CONTROLS · SHIELDS · ARSENAL · LORE`.
- **Codex** (C) is its own screen, reachable from the **title, galaxy hub and pause** — and mid-fight,
  where it pauses and returns you to the pause menu rather than straight back into combat.
  - **Opened by meeting, finished by killing.** Every encounter ends in a kill or a lost hull, so
    meeting a foe opens its entry: the real portrait in its pigment, name, rank, role, TELL and
    COUNTER. The **field note** (the lore) waits for the first kill (a lieutenant counts), and a
    `CODEX UNLOCKED` floater says so. An entry never met shows `? ? ? ? ?` and a flat grey silhouette.
    Progress persists across runs and shows as `MET m · DEFEATED n / 18`. Wiping records clears both.
  - **BOSSES is the command tree itself** — listed under rank headers from APEX down, each with its
    rank, what it answers to and who it commands (subordinates you haven't met stay `???`).
  - Each opened entry renders the **real sprite** from the game's own draw code, with role, threat,
    **TELL** (what you see before it hurts), **COUNTER** (what you do about it) and a field note.
  - `1/2` or `←→` switch tabs, `↑↓` or click walk entries, `C`/`Esc` back.
- **Hub lore** gives every boss a bespoke debut line naming its rank, and every court a line naming
  its commander and escorts.

## Balance model

Player power is exponential in this genre; that's the point. The enemy curve is exponential too,
so the late game never becomes a formality. Two sides hold it in check:

- **Stack caps** on the core multipliers (`dmg` ×10, `rate` ×8, `hp` ×10, `vamp` ×6). Gains stack
  **additively** on the base; penalties stay multiplicative.
- **A three-segment enemy curve** (`EXP_HP*` / `EXP_DMG*` in `game.js`), fitted against the measured
  player curve:
  - **S5–S60** — both sides grow fast; enemy HP +5.7% per sector tracks the drafted build.
  - **S60–S110** — the capped card pool **plateaus** the player, so enemy growth slows to ~2% per
    sector and the run stays winnable up to and through the Apex.
  - **S110+** — past the Apex, a deliberate steep ramp (+10% HP, +7% damage per sector) so the endless
    run ends.
- Enemy *damage* grows slower than player max HP, so depth kills you through density and pressure
  rather than two-shotting you.
- **+3 max HP per level**, passively — so builds that don't spend most of their picks on Nanoweave
  stay viable at depth.
- Multi-boss nests scale sub-linearly: total HP rises with count but each boss hits softer, so three
  bosses is busier and harder, not three times longer.

**How it's checked.** The fight simulator (`node test.js --only fightsim`, or add `--verbose` for the
table) plays the real game loop with a scripted pilot and three drafted builds: Balanced, Greedy and
**Homing Hose** (barrels, Seeker and damage, the strongest line in play). It measures real
normal-sector clear times and real time-to-kill for every nest from S5 to S100.

- Normal-sector clear times for the Homing Hose are asserted within the target bands.
- Every nest's lead must be a real fight (at least 6 s) and killable within the cap.
- Boss HP is being fitted to the per-band nest targets. Until then those bands are reported, not
  asserted (`FIGHTSIM_STRICT`), and the wall past S100 is re-asserted as part of that fit.

## Upgrades (46)

Cards are state-aware: what you see is what this pick does for your current build.
Upgrade cards are `req`-gated, so you never draft an improvement to a system you don't own.

**Core** — rate / damage / max-HP / **Ion Thrusters** (dash unlock, then cooldown) /
**Slipstream** (speed, needs dash).

**Overdrive** — every stat stick pays: **Overclock** (+rate, −dmg) / **AP Rounds** (+dmg, −rate) /
**Nanoweave** (+HULL, −speed). Common → Mythic variants share a stack budget; higher rarity, better rate.

**Barrels** — **Gun Array** (+1 shot, slower) across common / Mk I / **Mk II ★** (lighter mounts) /
**Split Chamber ★★★★★** (MYTHIC: DOUBLE barrels, HALVE damage — future damage picks hit twice as hard) /
**Minigun Amps** (+1 barrel, wider spread, damage split across barrels).

**Ammo** — **Incendiary** (burn) / **Cryo** (chill) / **Slug** (+dmg, −rate, bigger) /
**Seeker** (homing) / **Ricochet** (bounces off walls *and* obstacles) / **Lance Rounds** (pierce) /
**Flak Rounds** (detonate on impact) / **Corrosive Rounds** (armour shred, 5 stacks) /
**Chain Shot** (arcs to a second foe) / **Overcharge Rounds** (every 5th volley is a heavy slug).

**Abilities** — **Kinetic Discharge** (charges on *kills*, then blasts) with three follow-ups:
**Capacitor Tuning** (−10 kills to charge), **Discharge Amplifier** (+60% damage),
**Resonance Field** (+45% radius, adds chill) / **Orbital Cannon** (telegraphed strikes) /
**Prism Lance** (periodic piercing beam) / **Guardian Orbit** / **Frost Nova** / **Tesla Arc ★** /
**Kill Surge** / **Shrapnel Core** (slain foes burst).

**Defence** — **Aegis** / **Warding Plate** / **Bulwark Matrix** / **Crit Ward ★** /
**Ablative Barrier ★** / **Stasis Protocol ★** (3 tiers) / **Second Wind ★** /
**Adrenal Core** (+dmg as HP drops) / **Repair Drone** (regen after 4s undamaged).

**Utility** — crit / **Vampire Chip** / tractor / **Magnet Core** / **Salvage Protocol** (gems mend) /
**Portal Cell** / **Gate Overdrive** / **Instant Transit**.

**Field Refit** is a repeatable filler that appears only when the capped pool has nothing left, so a
deep endless run always has a card to draft.

Combo logic: barrels multiply shots and compose with Slug/Crit/Seeker/Pierce; burn + chill apply
together; Corrosive shred multiplies every source; Tractor × Magnet compound; shields resolve
Crit Ward (heavy) → Ward → Bulwark → Barrier → Aegis.

## Files

- `index.html` — canvas + loader · `styles.css` — the page around the canvas and the `@font-face` rules
- `fonts/` — the two bundled faces, Michroma (display capitals) and Martian Mono (data, at 75% width), with their OFL licences
- `game.js` — full game, fixed-timestep 60Hz, swept circle collision, `window.__kriefne` test hook.
  The look ("Etched Record": everything drawn as engraving on the Golden Record KRIEFNE carries) lives in
  one token table `K` at the top and one rendering section; `DESIGN.md` documents the system
- `test.js` — headless QA harness (excluded from deploy via `.vercelignore`)

## QA

```sh
node --check game.js      # syntax
node test.js              # everyday run (~35 s): every suite except the slow fightsim and fuzz
node test.js --all        # everything (~3 min); required before merging to main
node test.js --only fightsim --verbose   # the fight simulator's table
node test.js --only kits1                # one suite
```

`test.js` boots the real `game.js` in a Node VM with stubbed DOM/Canvas/WebAudio/storage and drives
it through `window.__kriefne`. Nothing mocks game logic; every assertion runs the shipping code path.
It is importable (`const {boot, fightNest, simFight} = require('./test.js')`) for ad-hoc telemetry.

Suites, in run order:
- **Per-boss kits:** `kits1`–`kits4`, covering every attack, recovery counter, phase and summon for all 20 gods.
- **Progression and pacing:** `xp`, `boot`, `sectors`.
- **Hit resolution:** `bullets` and `swept` (collision tunnelling).
- **Maps and cards:** `procgen` and `pool` (card gating).
- **The chain of command:** `fightsim` (slow), `hierarchy` and `teleport`.
- **Boss engine:** `prims` (primitives, status, phases) and `fuzz` (slow: all 20 gods as lead and summoned).
- **Run integrity:** `combos` (card bounds), `codex`, `endless` and `cascades`.
- **Persistence and look:** `save`, `pigment`, `maps`.
- **Access and safety:** `voice`, `safety`, `replay` and `srmirror` (screen-reader mirrors).

Run `node test.js --all` for the current check count; every check must pass.

