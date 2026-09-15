# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Played in desktop browsers today (Vercel static deploy). A **mobile version and a Steam version are planned**; whether either one is a wrapper around this build or a separate native build is undecided. Until it's decided, the platform stays `web`, and new work should not make those ports harder.

## Users

**Roguelite and twin-stick genre players** who come back for many runs. They care about build depth (drafting and combining upgrade cards), learning boss patterns, pushing the deepest sector, and filling in the codex. They play on a keyboard and mouse today, in sessions that can run from one quick sector to a long endless run. They know genre conventions and notice unfair deaths, soft-locks, and upgrade cards that lie about what they do.

## Product Purpose

KRIEFNE is an endless top-down action roguelite. The player fights down a galaxy trail of procedurally generated sectors that grow larger, denser, and harder, drafts 1-of-3 upgrades on level-up, and faces a boss nest every fifth sector, climbing a twenty-boss chain of command to the Apex at S100. The endless run is tuned to end: a deliberate wall lands between S110 and S130.

Success: players start another run after they die, feel that each death was their own fault, and want to see the next boss and the next codex entry.

## Positioning

- **Fairness rules the game enforces.** Boss recovery is a scripted beat with a budget (one recovery per HP threshold, 8% of max HP each, no passive regen). The player never loses their guns. Every heavy attack has a telegraphed tell. A boss can never be lost off-screen, and upgrade cards show what the pick does for the current build. Unfairness counts as a bug.
- **A chain of command.** Twenty bosses hold ranks (APEX, SOVEREIGN, LORD, CAPTAIN, ENFORCER). One god leads each nest, and each calls the god directly beneath it on the trail. The codex presents the bosses as that command tree.
- **A story told through recovered transmissions.** KRIEFNE is a human exploration ship sent long ago to find life, and home has never answered. The alien machine gods have been capturing every signal, and each god you defeat gives up its hoard. Over the climb to S100 those transmissions reveal that home and every alien civilization died out, and that only machines are left, KRIEFNE included. `LORE.md` is the canon.

## Operating Context

- Loop: title → galaxy hub (pick a sector node) → sector fight → clear → XP gems → upgrade draft → EXIT gate → back to the hub. Cleared sectors can be replayed only as a drill: no XP, drafts or boss bonus, and the hull comes back exactly as it went in. Death ends the run, and the score and depth are banked.
- Persistent progress: best score, deepest sector, total boss kills (each one adds a permanent +2% damage), and codex unlocks. Codex entries open on the first encounter (portrait, name, rank, tells, counters) and complete on the first kill (the field note).
- Screens: title, galaxy hub, in-sector HUD, upgrade draft, pause, settings (O), help (H: CONTROLS · SHIELDS · ARSENAL · LORE), codex (C, reachable from title, hub, pause and mid-fight), game over.
- Terminology already in use: sector (S1, S2…), nest, thrall, summoned god, chaff, EXIT gate, Portal Cell, recall, blink, codex, status effects shown in caps (PETRIFIED, JAMMED, PHASED, ENRAGED, RELENTLESS).

## Capabilities and Constraints

- **Zero dependencies and zero API keys (hard constraint).** All art is drawn in code and all audio is synthesized with WebAudio.
- **Assets are allowed where they're small and necessary (confirmed 2026-09-12).** Fonts are the first case: the game may bundle its own font files so the type is identical on every OS and works offline, from `file://`, and in a Steam wrapper. Other assets are added deliberately as the game grows, never by default.
- **Keep it simple enough to port (hard constraint).** Future mobile and Steam versions must stay easy to build. Avoid choices that tie the game to one input method, one screen size, or browser-only machinery without a reason.
- Current implementation: vanilla JS, one Canvas with a fixed internal resolution of 960×640, and every UI element (HUD, menus, codex) drawn on the canvas rather than in the DOM. The game runs on a fixed-timestep 60Hz loop with swept circle collision, and settings are saved in `localStorage`. None of these was confirmed as a permanent constraint.
- Current input is WASD/arrows, mouse aim, click or auto-fire, Space/Shift to dash, and E for the gate or recall. There are no touch controls yet. A mobile port will need a touch control scheme, which hasn't been designed.
- Content: 46 upgrade cards, 20 bosses, 6 chaff enemy types, 6 sector themes (palette, obstacle style, music), and 6 layout archetypes.
- Runs persist until death: the run is checkpointed to `localStorage` at the hub and on entering each sector, and resumes from the title with CONTINUE. XP is collect-only: gems stay on the field after a clear and are lost if you exit without them. Dash and recall that the player passes on come back as a fourth draft card.
- Quality bar: `node test.js` (thousands of checks) boots the real `game.js` headless. It pins the balance curve and the README balance figures (±20%), the S110–S130 wall, procgen reachability and open space, XP conservation, draft gating, run save and resume, and the chain-of-command rules. Changes must keep it passing.
- **Undecided:**
  - the open lore questions listed in `LORE.md` §14, plus the Transmission Archive feature it proposes (planned, not built)
  - the port strategy (wrapper or native) for mobile and Steam
  - the touch control scheme
  - any monetization or store presence

## Brand Commitments

- Name: **KRIEFNE**, subtitled "Roguelite". **KRIEFNE is the ship**: a human-built machine exploration ship. The player is its flight AI, restored from backup after each death. The name stands for **Keeper of the Reach, In Exploration For New Existence**, which is kept hidden until the story reveals it at S100 so the name stays a mystery (`LORE.md` §4).
- **The game is entirely space-themed and always has been (confirmed).** A machine spaceship fights alien machine ships. There are no cities, streets or ground settings. The rules: nothing travels faster than light, and no organic life lasts long enough to cross space, so every species explores with machines. The enemies are alien machine gods with a **Norse lean**: ancient, ranked in a hierarchy, and written with kennings, holmgang, and hoards, without naming real Norse gods.
- **The canon lives in `LORE.md`.** It covers the premise, the gods, the transmissions, and the four voices. Codex text is in KRIEFNE's voice (dry and deadpan), while the gods speak in a saga-like register. `LORE.md` §13 lists what is already in the game and what is still to build.

## Evidence on Hand

- The playable game (`index.html`, `game.js`) and a detailed design README (`README.md`) covering the rules, balance, the boss trail, and upgrades.
- Pinned balance data: time-to-kill tables per nest for the ceiling and farmer builds (README "Balance model", enforced by `test.js`).
- The lore bible (`LORE.md`, draft 2), and the existing lore fragments in `game.js`: a codex lore line for every god and servitor, debut lines for each boss (`DEBUT_LORE`), nest lines on the hub, and the Help LORE tab. It is rewritten to match the bible.
- **Absent, so never fabricate:** player counts, reviews or testimonials, press, store pages, screenshots or trailer assets, awards, and any release dates for the mobile or Steam versions.

## Product Principles

1. **Fair before hard.** Difficulty comes from density, pressure, and readable patterns. It never comes from hidden rules, lost information, or taking control away from the player.
2. **Rules come from one source.** Mechanics that appear in several places (schedule, codex, hub lore, tests) are derived from a single definition, so what the game shows always matches what it does.
3. **Show what's true.** Cards, the codex, and the HUD state what the current build and the current fight actually do. Locked information stays hidden, and it's never faked.
4. **Hierarchy is the story.** The chain of command and the lore should explain each other: who a boss answers to, who it commands, and which transmissions it's holding. Every fairness rule has an in-world reason: a clause of the holmgang in `LORE.md`.
5. **Portable by construction.** The game has no dependencies and only small, deliberate assets (no asset pipeline), and it's kept simple enough that mobile and Steam versions can be built without a rewrite.
