# KRIEFNE — Roguelite (endless)

Small polished top-down action roguelite, set in deep space: you are KRIEFNE, a machine exploration ship,
fighting alien machine ships ranked like Norse gods. Vanilla JS Canvas, zero dependencies, zero assets, zero API keys.
The story and setting live in [`LORE.md`](LORE.md).
Endless: fight down a galaxy trail of sectors that grow larger, denser and meaner forever, through a
twenty-boss chain of command that tops out at the Apex in S100 — and a run that is meant to end not long after.

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

## The chain of command (20 bosses)

One god per nest, never a court. Each boss summons **the god directly beneath it on the trail**: S(n) calls S(n−5).

| Rank | Bosses |
|---|---|
| **APEX** | SINGULARITY |
| **SOVEREIGN** | ARCHON · COLOSSUS · BASILISK · PROGENITOR · HARBINGER · KRAKEN · JUGGERNAUT · ECLIPSE · NULLIFIER · CHORUS |
| **LORD** | LEVIATHAN · HYDRA · WYVERN · ORACLE · SENTINEL |
| **CAPTAIN** | WARDEN · PHANTOM · REVENANT |
| **ENFORCER** | OVERLORD |
| *chaff* | drone · mite · stalker · sniper · tempest · brute |

Rank names are chosen so they never collide with a boss name.

**The rules** — all derived from `BOSSDEF` and `LADDER`, never written down twice:

- **Every boss debuts alone**, at the nest listed below. Its `debut` field is the single source of
  truth: the schedule, the hub lore and the codex all read it.
- **One lead per nest, always.** Summoning is the only way a second god enters a fight.
- **Summon points:** S10–S20 once at 50%; S25–S45 at 60% and 30%; S50–S95 at 70% and 35%.
  ORACLE's Call comes at 50% (it flees and mends while its WYVERN pair lives); ARCHON calls
  SENTINELs at 75% and 25%; SINGULARITY's Convocation comes at 50%.
- **A summoned god** runs its full Phase-1 kit at 85% size, with **45% of the HP** that kind would
  have leading a nest at this sector, hitting at **85% damage**. It never recovers, never banks the
  permanent bonus, and never phases.
- **Chains** (a summoned god summoning its own): never at S5–S45; one extra link at 50% for
  S50–S95; two links past S100.
- **SINGULARITY (S100)** summons CHORUS, NULLIFIER and ECLIPSE together at 50%; at 25% it
  absorbs every remaining small enemy and summoned god, then enters **Phase 2 with twice the HP**
  and hidden attacks (quasars and more).

**Past S100: the Second Winter.** The ladder repeats from OVERLORD as *returned* gods — one lead
per nest, same kits, HP on the post-Apex curve, each chaining one link deeper. The run ends
against the wall in the S110–S130 band, by measurement, not by decree.

**The trail** (generated by `bossKindsFor`) — each nest leads its debut god, who calls the god below:

| Nest | Lead | Calls |
|---|---|---|
| S5 | OVERLORD | ordinary enemies (War Cry) |
| S10 | WARDEN | OVERLORD |
| S15 | PHANTOM | WARDEN |
| S20 | REVENANT | PHANTOM |
| S25 | LEVIATHAN | REVENANT |
| S30 | HYDRA | LEVIATHAN |
| S35 | WYVERN | HYDRA |
| S40 | ORACLE | WYVERN ×2 |
| S45 | SENTINEL | ORACLE |
| S50 | **ARCHON** | SENTINEL (75% and 25%) |
| S55 | COLOSSUS | ARCHON |
| S60 | BASILISK | COLOSSUS |
| S65 | PROGENITOR | BASILISK |
| S70 | HARBINGER | PROGENITOR |
| S75 | KRAKEN | HARBINGER |
| S80 | JUGGERNAUT | KRAKEN |
| S85 | ECLIPSE | JUGGERNAUT |
| S90 | NULLIFIER | ECLIPSE |
| S95 | CHORUS | NULLIFIER |
| S100 | **SINGULARITY** | CHORUS + NULLIFIER + ECLIPSE |
| S105+ | returned gods | one link deeper than debut |

- **OVERLORD** — brawler. BURST / SUMMON / CHARGE / SWEEP. Never recovers.
- **WARDEN** — siege fortress. Spirals, guards, seismic slams, twin staggered waves.
- **PHANTOM** — blink skirmisher. Bolt fans, teleports, a locked LASER line.
- **REVENANT** — cold-sleeper. Rime volleys; retreats to its Sleeper Pod to mend.
- **LEVIATHAN** — segmented serpent. Burrows and resurfaces under you; the body hurts.
- **HYDRA** — three-throated. Acid spit pools; severed heads regrow and mend it.
- **WYVERN** — strafing wing. Dive strafes; perches to Roost and mend.
- **ORACLE** — the Rememberer. The Call at 50%: it flees and mends while its WYVERN pair fights.
- **SENTINEL** — shield-wall. A 360° mirror that mends it; dropped to throw the spear.
- **ARCHON** — law-speaker. Calls SENTINELs at 75% and 25%; it never hides, never heals.
- **COLOSSUS** — the Walled. Entrenches behind regrowing plates.
- **BASILISK** — controller. A telegraphed gaze cone **petrifies**; lunges leave spikes.
- **PROGENITOR** — brood-hall. Fighter bays; docks fighters to mend; its P3 halves split tethered.
- **HARBINGER** — bullet-hell caster. Rotating walls with one gap; targeted meteors.
- **KRAKEN** — deep-grasp. Grasping arms; retreats into ink to mend.
- **JUGGERNAUT** — ram. Armoured prow takes 40%; the **rear vent takes 190%**. Facing locks while charging.
- **ECLIPSE** — the Dimming. Dims the arena; teleports (Totality Step) to mend.
- **NULLIFIER** — the Silent. True tracker jam (SIGNAL LOST); teleports (Silent Step) to mend.
- **CHORUS** — splitter. Fractures into synced echoes at 66% and 33%.
- **SINGULARITY** — apex. Convocation at 50% (three gods); Absorption at 25%: it devours the
  field and returns doubled, with quasars.

### Boss recovery is budgeted

Recovery is a scripted beat, not a timer — and only leads get one (summoned gods and echoes never recover):

- One recovery per HP threshold in the kit's list (usually a single beat at 55%), never in the first 12s.
- Each one restores at most **8% of max HP**, drawn from a fixed pool granted per recovery — so a
  long recovery heals no more than a short one.
- **No passive out-of-combat regen**, so a boss can never be worn down, flee, and heal back up.
- A **PHASED** boss absorbs rounds at 30% damage — mitigated, never bullet-transparent.
- Bosses that wedge in geometry or kite too far **reposition** visibly, and an off-screen boss tracker
  means you can never lose one.
- Any fight running past twice its band's target length makes the boss **RELENTLESS** — no further recoveries.

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
(`PIGMENT_DEF`), always quieter than gold and red, so a mixed wave reads as kinds at a
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
    COUNTER. The **field note** (the lore) waits for the first kill, and a
    `CODEX UNLOCKED` floater says so. An entry never met shows `? ? ? ? ?` and a flat grey silhouette.
    Progress persists across runs and shows as `MET m · DEFEATED n / 20`. Wiping records clears both.
  - **BOSSES is the command tree itself** — listed under rank headers from APEX down, each with its
    rank, what it answers to and who it commands (subordinates you haven't met stay `???`).
  - Each opened entry renders the **real sprite** from the game's own draw code, with role, threat,
    **TELL** (what you see before it hurts), **COUNTER** (what you do about it) and a field note.
  - `1/2` or `←→` switch tabs, `↑↓` or click walk entries, `C`/`Esc` back.
- **Hub lore** gives every boss a bespoke debut line naming its rank, and every nest a line naming
  its lead and whom it calls.

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
- Summoned gods scale sub-linearly: 45% of lead HP at this sector, hitting at 85%, so a called
  god is busier and harder, not a second full fight.

**How it's checked.** The fight simulator (`node test.js --only fightsim`, or add `--verbose` for the
table) plays the real game loop with a scripted pilot and three drafted builds: Balanced, Greedy and
**Homing Hose** (barrels, Seeker and damage, the strongest line in play). It measures real
normal-sector clear times and real time-to-kill for every nest from S5 to S100.

- Normal-sector clear times for the Homing Hose are asserted within the target bands.
- Every nest's lead must be a real fight (at least 6 s) and killable within the cap.
- Boss HP is fitted to the per-band nest targets, and the bands are asserted
  (`FIGHTSIM_STRICT`); the wall past S100 is asserted too (S105 clearable, the run over by S130).

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

