---
name: KRIEFNE
description: An endless space roguelite drawn as the engraved cover of the record its ship carries.
colors:
  gold: "#e2ae4b"
  gold-hi: "#f7d991"
  gold-dim: "#86672c"
  gold-faint: "#3a2d14"
  on-gold: "#3b2c10"
  red: "#e2553c"
  red-hi: "#ff8166"
  red-dim: "#7c2b1f"
  hydro: "#bfe8f3"
  ground: "#07080c"
  deep: "#040507"
  lift: "#0e1118"
  hull: "#12151d"
  metal: "#8b95a2"
  metal-dim: "#4a525e"
  metal-faint: "#262b34"
  text: "#dde2e8"
  text-dim: "#9ca5b0"
  pigment-stalker: "oklch(0.66 0.06 128)"
  pigment-brute: "oklch(0.71 0.111 176)"
  pigment-tempest: "oklch(0.59 0.119 160)"
  pigment-sniper: "oklch(0.61 0.098 231)"
  pigment-drone: "oklch(0.72 0.114 265)"
  pigment-mite: "oklch(0.69 0.110 344)"
  pigment-basilisk: "oklch(0.58 0.104 131)"
  pigment-nullifier: "oklch(0.74 0.116 148)"
  pigment-leviathan: "oklch(0.64 0.108 173)"
  pigment-chorus: "oklch(0.73 0.080 200)"
  pigment-oracle: "oklch(0.58 0.067 217)"
  pigment-warden: "oklch(0.66 0.118 230)"
  pigment-singularity: "oklch(0.74 0.111 267)"
  pigment-phantom: "oklch(0.60 0.111 272)"
  pigment-archon: "oklch(0.67 0.118 303)"
  pigment-harbinger: "oklch(0.58 0.111 321)"
  pigment-juggernaut: "oklch(0.74 0.118 336)"
  pigment-overlord: "oklch(0.66 0.075 356)"
  sector-relay-drift: "oklch(0.145 0.018 245)"
  sector-archive-reef: "oklch(0.145 0.018 195)"
  sector-broken-ring: "oklch(0.145 0.018 140)"
  sector-slag-belt: "oklch(0.145 0.018 50)"
  sector-hull-ossuary: "oklch(0.145 0.018 295)"
  sector-rose-veil: "oklch(0.145 0.018 350)"
typography:
  display:
    fontFamily: "Michroma, 'Martian Mono', sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "4px"
  headline:
    fontFamily: "Michroma, 'Martian Mono', sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "3px"
  title:
    fontFamily: "Michroma, 'Martian Mono', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "2px"
  title-small:
    fontFamily: "Michroma, 'Martian Mono', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "2px"
  label:
    fontFamily: "Michroma, 'Martian Mono', sans-serif"
    fontSize: "9px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "2px"
  body:
    fontFamily: "'Martian Mono', ui-monospace, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "'Martian Mono', ui-monospace, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  readout:
    fontFamily: "'Martian Mono', ui-monospace, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
spacing:
  edge: "14px"
  rim: "24px"
  hud: "56px"
  margin: "64px"
  entry-pitch: "48px"
  rim-tick: "40px"
  ring-step: "3.5px"
  hatch: "4px"
components:
  entry-committed:
    textColor: "{colors.gold}"
    typography: "{typography.title}"
    height: "44px"
    width: "400px"
  entry:
    textColor: "{colors.text}"
    typography: "{typography.title}"
    height: "44px"
    width: "300px"
  entry-danger:
    textColor: "{colors.red}"
    typography: "{typography.title}"
    height: "44px"
  tab-active:
    textColor: "{colors.gold}"
    typography: "{typography.title-small}"
  tab:
    textColor: "{colors.text}"
    typography: "{typography.title-small}"
  hud-strip:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text-dim}"
    typography: "{typography.label}"
    height: "{spacing.hud}"
    width: "960px"
  draft-card:
    textColor: "{colors.text}"
    typography: "{typography.title-small}"
    width: "220px"
    height: "204px"
  draft-card-nest:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ground}"
    typography: "{typography.title-small}"
    width: "220px"
    height: "204px"
  codex-plate:
    textColor: "{colors.text}"
    typography: "{typography.body}"
    padding: "18px"
    width: "628px"
    height: "378px"
---

# Design System: KRIEFNE

## Overview

**Creative North Star: "The Etched Record"**

KRIEFNE is drawn as the engraved cover of the record the ship carries: hairline diagrams, tick marks, binary counts and instructions for strangers. Every visible surface (title, galaxy hub, playfield, HUD, draft, pause, settings, help, codex, game over) is drawn in code on a single 960×640 canvas in `game.js`. The page around it (`index.html`, `styles.css`) only carries the same dark, a 1px bare-metal frame, a key-hint line and the two self-hosted faces.

Every mark is a monoline stroke. Light is shown by line density and hatching: the build has no `shadowBlur`, no gradients and no blur. Colour is a vocabulary with one meaning per colour. Gold is KRIEFNE, red is harm, pigment is who a hostile is, hydrogen is salvage, and bare metal is wreckage and neutral text. State is shown by the shape of a line (solid or dashed, single or double, ringed or ticked) before it is ever shown by hue.

The system turns down the genre default of neon lines glowing on black. That covers grid floors, cyan and magenta neon, glow, bloom, blur halos, glass panels, rounded tiles, gradient chrome, a box around every menu item, and NASA-punk costume.

**Key Characteristics:**
- One canvas, fixed 960×640 logical units, scaled to fit at 3:2 and repainted at device density so hairlines stay sharp.
- Cold near-black ground, faintly tinted per sector by its star's hue.
- Monoline strokes at 1 to 1.5px, with 2 to 3px reserved for meters, heavy rounds and enraged outlines.
- Two faces cut by the same stylus: Michroma for names and titles, Martian Mono for numbers and KRIEFNE's voice.
- Solid means committed. Dashed means possible, pending, arming or locked.
- One inversion in the whole game: the nest's bonus draft, black engraving on a gold field.

## Colors

The palette is a dark instrument with one warm metal, one harm colour, one salvage colour and a family of eighteen muted identity pigments.

### Primary
- **Record Gold** (gold): KRIEFNE and everything that is its own. That covers the ship's hull, your rounds, shields, the EXIT beacon, the recall gate, orbital strikes, the pulsar fix, the travelled trail on the hub, committed menu rules, screen titles and the HUD values that are yours. Gold is never used on a hostile.
- **Hot Gold** (gold-hi): gold at its hottest. Crit tracers, the ship's hit flash, the lance core, the crit-ward ring, shield-block floaters and a full discharge meter.
- **Tarnished Gold** (gold-dim): gold that is not yet committed. Dashed menu rules, hollow entry markers, the untravelled trail, engine cuts, the recall line in range, and the codex detail plate's corner ticks.
- **Groove Gold** (gold-faint): alternate groove bands on the title disc. Nothing else.
- **Gold-Field Ink** (on-gold): secondary text on the inverted nest draft, and only there.

### Secondary
- **Oxide Red** (red): harm. That means every enemy round, shock ring, beam, laser, gaze cone, hazard, arming telegraph and blast-band preview, plus the status words that are being done to you (JAMMED, PETRIFIED), the FOES count, a low hull, the hull-critical frame, TELL labels in the codex, YOU DIED, and destructive confirmations (ABANDON SAVED RUN?, RESET RECORDS). A hostile turns red only in the moment it commits: the armed stalker, the sniper or tempest taking aim, the rotor flare, the brute's wind-up.
- **Hot Oxide** (red-hi): the hot core of an enemy round, the extra ring on a heavy round, the outline of a hostile that is committing, and the core line of a boss beam.
- **Dried Oxide** (red-dim): hatching inside hazards and gaze cones, harmless shock rings from hostiles, and an unarmed destructive rule.

### Tertiary
- **Hydrogen Blue-White** (hydro): salvage only. XP gems (the record's hydrogen mark: two linked 2.6px circles with a nucleus, a form no hull shares, so a round drone can never pass for salvage), XP pickup sparks and floaters, and the HUD's XP ON FIELD tally.

### Pigments
One muted OKLCH colour per servitor and per god, defined as `[hue, lightness, chroma]` in `PIGMENT_DEF`. The frontmatter values are the canonical base colour (`c`). `mkPigment` derives every variant, so none is typed by hand:
- `c` for outline, core, rank rings, HP bar, codex marker and the boss tracker.
- `hi` (L+0.1, C×0.85) when enraged, and for the RETREATING and ENRAGED labels.
- `dim` (L×0.6, C×0.7) for inner engraving and summoned-god / echo rank rings.
- `body` (L 0.215, C×0.28) for the hull fill, with the pigment barely present.
- `flash` (L 0.37, C×0.6) for a struck hull.

Servitors: stalker (lichen), brute (jade-teal), tempest (malachite), sniper (steel blue), drone (periwinkle), mite (rose-mauve). Gods: overlord (madder), warden (cerulean), phantom (indigo), revenant (rime), leviathan (verdigris), hydra (lilac), wyvern (ash-rose), oracle (slate), sentinel (glacier blue), archon (amethyst), colossus (pale stone), basilisk (moss), progenitor (brood teal), harbinger (plum), kraken (deep blue), juggernaut (orchid), eclipse (dusk), nullifier (pale jade), chorus (sea-glass), singularity (ultraviolet).

### Neutral
- **Cold Ground** (ground): the dark behind the title, HUD strip, menu scrims, knockouts behind world text, and the ink of the nest-draft inversion.
- **Deep Field** (deep): the field past the sector rim, and the title disc's face.
- **Armour Plate** (lift): bare-metal armour inside a silhouette (the juggernaut's prow).
- **Hull Black** (hull): fills inside refit icons.
- **Bare Metal** (metal): wreckage sparks from chaff deaths, damage numbers, chill and slow rings, groove end-stops, unmet-god rank rings on the hub, and codex FIELD NOTE labels.
- **Dim Metal** (metal-dim): hairline tracks, HUD ticks, empty binary cuts, locked nodes, the page frame, dividers.
- **Faint Metal** (metal-faint): the pulsar-map fan lines back to HOME.
- **Pale Steel** (text): primary neutral text and resting menu labels.
- **Worn Steel** (text-dim): secondary text, key hints, HUD legends, locked states.

### Sector tints
Each of the six `THEMES` carries a `tint` hue, and `mkSectorPal(H)` derives that sector's palette from it in OKLCH: ground (0.145, 0.018), deep (0.115, 0.012), hull (0.205, 0.02), faint (0.3, 0.026), dim (0.45, 0.03), metal (0.68, 0.01) and motif (0.36, 0.04). The hues run steel (245, Relay Drift), teal (195, Archive Reef), sage (140, Broken Ring), umber (50, Slag Belt), ash-lilac (295, Hull Ossuary) and rose (350, Rose Veil). A star within 20° of red's hue (32) drops its motif chroma to 0.02, which currently means Slag Belt. The playfield and the galaxy hub (tinted by the selected sector) use the sector ground. The title, HUD and menus use Cold Ground.

### Named Rules
**The One Meaning Rule.** Every colour means one thing. If a new element needs a colour, first decide whose it is: KRIEFNE's (gold), harm (red), a hostile's identity (its pigment), salvage (hydrogen) or wreckage and neutral (metal). There is no decorative colour.

**The Gold Is Home Rule.** Gold never appears on a hostile. Not on its hull, its rank, its label or its tracker.

**The Red Is Harm Rule.** Red marks what is about to hurt you or is hurting you. A hostile at rest is never red. It turns red only for the moment it commits, then goes back to its pigment.

**The Pigment Is Identity Rule.** A new pigment must keep its hue outside 15–118 (gold's and red's bands), its lightness within 0.58–0.74 and its chroma at or below 0.12. It must sit at least ΔE 0.13 (OKLab) from gold, red, red-hi and hydrogen. It must also sit at least 0.09 from every other god, every other servitor, and each god's own chaff. The `pigment` suite in `test.js` enforces all of it.

**The Enraged Ticks Rule.** An enraged god (below 30% HP) does not turn red. It moves to its `hi` variant, its outline thickens to 2px, and its outermost rank ring gains 24 alternating ticks of 5 and 8px in `hi`.

**The Unmet Stays Bare Rule.** A god you have never met shows no pigment on the hub or in the codex. Hub nest rings stay bare metal, codex entries read `? ? ? ? ?` with no pigment marker, and the portrait is a flat grey silhouette. Meeting a god (every encounter ends in a kill or a lost hull) opens its pigment, portrait, rank, tells and counters; the kill adds the field note.

**The Silver Edge Rule.** The lit edges of wreckage stay bare silver in every sector (chroma ≤ 0.015, tested), so no hull ever passes for a hostile.

**The Tint Not Colour Rule.** Sector tint stays under 0.04 chroma and grounds stay below L 0.16 (tested). It is a tint you notice over a run, never a colour you read.

## Typography

**Display Font:** Michroma (falls back to Martian Mono, then sans-serif)
**Body Font:** Martian Mono (falls back to ui-monospace, Menlo, Consolas, monospace)
**Label/Mono Font:** Martian Mono at 600 for numbers and readouts

**Character:** Wide monoline engraver's capitals paired with a narrow tabular technical face, like two styli from the same hand. Both are self-hosted woff2 files in `fonts/` (OFL licences alongside), declared in `styles.css` with `font-display: block`. The canvas holds its first frames until both faces load, for at most 1.5s.

### Hierarchy
- **Display** (Michroma 400, 22px, tracking 4px): screen titles such as SETTINGS, HELP and CODEX. Terminal states go larger: the draft title at 20px, PAUSED at 26px and HULL LOST at 34px.
- **Headline** (Michroma 400, 18px, tracking 3px): the hub's sector title, the codex entry name.
- **Title** (Michroma 400, 13px, tracking 2px): menu entry labels at 44px row height. Rows under 40px drop to 10px.
- **Title-small** (Michroma 400, 11px, tracking 2px): tabs, settings rows, draft card names, the HUD sector plate.
- **Label** (Michroma 400, 9px, tracking 2px): instrument legends beside their values (HULL, LV, DASH, GATE, CHARGE, AUTO), codex block labels (TELL, COUNTER, FIELD NOTE) and codex rank headers. Nothing goes smaller than 9px.
- **Body** (Martian Mono 400, 12px, 18px leading): intro copy, help lines (23px pitch), codex text (15px pitch), roughly 56–84 characters per line through `wrapLines`.
- **Caption** (Martian Mono 400, 11px): key hints, secondary lines, card descriptions (16px pitch). The 10px size is kept for the title credit line and tab numbers.
- **Readout** (Martian Mono 600, 11–13px): numbers and live values such as HULL 100/100, READY, S7, FOES 8 and EXIT 420m.

Michroma is always tracked at `round(px × 0.18)`, set through `heading()` and `track()`.

### Named Rules
**The Two Styli Rule.** Names, titles and labels go in Michroma through `heading()`. Numbers, sentences and KRIEFNE's voice go in Martian Mono through `mono()`. Never set a sentence in Michroma, and never set a screen title in Martian Mono.

**The Knockout Rule.** Text drawn over the playfield always goes through `inkText()`, which adds a 3px knockout stroke in Cold Ground behind the fill. That keeps it legible over wreckage without a panel or a glow.

## Layout

The canvas is a fixed 960×640 logical frame. `fitCanvas` scales it to the window at 3:2 (CSS first paint: `min(100vw − 24px, (100dvh − 96px) × 1.5)`) and re-asserts the device transform every frame, so all draw code works in logical units.

- **HUD:** a 56px strip across the top on Cold Ground, closed by a Dim Metal hairline with ticks every 24px (7px at every 120px, 3px otherwise). It has two rows of baselines at y 21 and 43. Legends sit at x 14, grooves at x 64 (150px wide) and values beside the groove at x 224, never on it. The sector plate and the FOES / XP ON FIELD tally are right-aligned at 14px from the right edge. Status words and the sector-clear notice hang centred under the strip.
- **Playfield:** a 24px rim inside the frame. The rim is a graduated dial edge with ticks every 40px (9px at every 200px, 4px otherwise). Past the rim the field drops to the sector's deep tone, so the edge reads without a wall.
- **Title and hub:** a 64px left margin. The title stacks the wordmark, subtitle, intro, a 400px entry column and the records line on the left. The title disc (R 300, centred at 806,330) bleeds off the right edge. The hub title sits at 64,86 over a rule, and the lore line and key hint sit centred over a rule 150px from the bottom.
- **Menus:** centred 300px entry columns at x 330 with a 48px pitch (42–44px rows). BACK always sits at 330,560, 300×44.
- **Draft:** three 220×204 cards at x 130 + 240i, y 220. A returning dash or recall card is a 460×62 strip below them at 250,446, not a fourth column.
 - **Codex:** a 210px index column at x 48 (20px rows) and a 628×378 detail plate at 286,168. The portrait sits in a 150px dashed plate inset 14px (100px on narrow windows). Text blocks start 18px in.
- **Page:** `styles.css` has three breakpoints. Below 560px of height the hint line tightens. On coarse pointers the keyboard hint is swapped for one touch line. Below 520px of width the frame padding tightens. The body respects safe-area insets.

## Elevation & Depth

The system is flat: there are no shadows, no glows and no gradients anywhere in the build. Depth comes from four things:
- **Tonal layering.** The deep field sits past the rim, and menus are drawn over the sector at 0.3 opacity with a Cold Ground scrim at 0.84 on top (`drawWorldMini`). Pause, draft and game over lay a 0.9 Cold Ground scrim over the live frame. Every translucent ink is derived from a token by `rgba()` once at load (`K.scrim`, `K.veil`, `K.goldSheen` and so on); none is typed by hand.
- **Line density.** Hatching and concentric hairlines stand in for light. Each sector has one light, a dying star past the rim engraved as nine concentric hairlines. Wreckage is hatched at 4px on the side facing away from that star, and its lit edges are drawn in bare metal.
- **Parallax.** A far star tile moves at 0.35 of the camera.
- **Knockouts.** `inkText()` sets world text off the playfield with a ground-coloured stroke.

### Named Rules
**The Line Density Rule.** Light is shown by more lines, never by blur. To make something read hotter, add a ring, a tick or a hatch, or step it to its `hi` variant. Never add `shadowBlur`, a gradient or a filter.

## Shapes

There are no radii anywhere. Frames are square, and plates are either corner-ticked (12px ticks) or fully ruled. Circles are native to this world and used everywhere: rings, grooves, the disc, gems, rank, portals, reticles. Silhouettes are built from polygons and arcs with miter joins, and the wordmark is straight strokes only, like runes, with an engraved inline in the ground colour. Round caps appear only inside refit icons and on the leviathan's mandibles.

State is carried by the form of a line:
- **Solid vs dashed.** A solid line means committed, real or travelled: the primary entry, the active tab, an ON toggle, a cleared trail leg, an unlocked node, a live hazard. A dashed line means possible, pending, arming or locked: the other entries, the untravelled trail, locked nodes, a hazard before it goes live, a boss re-entry point, a phased boss. Hovering an entry previews the commitment by making its rule solid.
- **Rank = rings.** Rank is drawn as concentric rings 3.5px apart just outside the silhouette: ENFORCER has 1 and APEX has 5. `rankRings()` draws them in the god's pigment, in `dim` for summoned gods and echoes. Thralls carry no rank rings: a 1px hairline hull and a 30px pip.
- **Rarity = rim ticks.** A draft card carries one, two or three 8px cuts along its top edge for common, uncommon and rare.
- **Heavy = double rule.** Heavy rounds carry a second ring. Damaging shock rings are a 2px ring with a 1px inner ring. The hull-critical frame is an inset double rule.

Dashes inside a god's silhouette (the warden, archon and overlord collars, drawn in `dim`) are part of its drawing and carry no state.

## Components

### Menu entries (`entry`)
An engraved label on a ruled line, not a button in a box.
- **Shape:** a rule with 3px end ticks set 5px above the row's bottom edge, and a 4px diamond marker at x+8.
- **Committed / primary:** solid 1.5px gold rule, filled gold diamond, gold Michroma label. Use it for one entry per set: CONTINUE or START, RESUME, RETRY.
- **Resting:** dashed 1px (4/4) rule in tarnished gold, hollow diamond, label in Pale Steel. The key hint is right-aligned in 11px Worn Steel.
- **Hover:** turns gold with a solid rule and a filled marker, the same as committed.
- **Danger:** the label, rule and marker go red. Use it only for destructive confirmations.

### Tabs and settings rows
- **Tabs (help, codex):** Michroma 11px centred over a `rule()`. The active tab is gold and solid, the others are Pale Steel over a tarnished-gold dashed rule. The tab number sits at the left in 10px Worn Steel.
- **Settings rows:** `[n]` in Worn Steel, a Michroma label, the value right-aligned in 600 mono (gold when ON, Worn Steel when OFF), and a bottom line that is solid gold when ON and dashed when OFF. Volume rows carry a groove meter.

### HUD instrument strip
- **Groove meter (`groove`):** a Dim Metal hairline track with a 3px filled cut, graduation ticks, and Bare Metal end-stops at ±4px. Hull and XP are gold, and hull turns red at ≤30%.
- **Binary ticks (`binTicks`):** recall charges as cuts 6px apart. A held charge is a tall (10px, 2px wide) gold cut, and an empty slot is a short (4px) Dim Metal cut.
- **Shield tags:** active shields are listed by their full card names (AEGIS PULSE, WARDING PLATE, BULWARK ×n, CRIT WARD, BARRIER n, STASIS ×n) as 600 mono gold text on a ground patch hung under the strip, with a tarnished-gold underline.

### Draft cards
- **At rest:** a corner-ticked `plate` in gold with rarity rim ticks, a `[n]` key, an engraved refit icon (46 icons, all monoline, inside a 1px ring), the name in Michroma 11px and the description in 11px mono.
- **Hover:** the plate becomes a solid 1.5px full frame.
- **Returning core (dash or recall):** a dashed full-frame strip that turns solid on hover. The name leads; the `[n]` key and "offered again" sit at the right in 11px mono, as the key does on the other cards. No label above the name.

### Draft header and cards
- The key line under every draft title reads `press 1 / 2 / 3 or click · [C] codex · [H] help`; the codex and help return to the same cards.
- Each card shows `OWNED n OF max` (10px mono, top right, under RARE when rare) once the hull carries it, and up to two `STAT a → b` lines in 600 mono in the card's main ink under the description. They come from `statDiff`, which applies the card to a copy of the ship; `previewing` makes any field side effect (Magnet Core's vacuum) a no-op.
- Mouse picks land on release, on the card the press began on, after a 300ms grace from the draft opening.

### Nest draft (the one inversion)
When a nest's bonus draft opens (`nestDraftAt`), the field fades to solid gold over 350ms (instant under reduced motion) with ground-coloured groove arcs every 4px. All ink flips to Cold Ground, with Gold-Field Ink for secondary text. `iconInk(true)` re-inks the refit icons in black. The screen reverts once a pick is made. No other screen inverts.

### Build plate (`drawBuild`)
Everything the hull carries, in draft order: each refit's engraving at 9px in a 40px cell, with `×n` under it once it stacks and `MAX` in gold at its cap, wrapping at the given width and capped at a row count with a `+n` cell. It appears on the end screen (2 rows), in pause (left column, 6 rows, beside a SYSTEMS column of label/value pairs) and on the hub (one row along the bottom).

### End screen (HULL LOST)
A record of the hull, centred above RETRY: HULL LOST in red over a red-dim rule; `BROUGHT DOWN BY` and the maker's name in its pigment with the blow in red (every hostile round, ring and field is stamped with its maker by `stampNext`); that foe's TELL (red label) and COUNTER (gold label); a faint rule; NEW BEST in gold when earned, then the run's numbers; the build plate; the Wake line in gold and the next god on the trail in Worn Steel (a god not yet met is named only by rank). RETRY is drawn committed only once the screen has settled (600ms); Space never skips it.

### Arrival banner
Between two red rules, the lead god's name (`RETURNS` past S100) in red display type, then one knocked-out 12px line in 600 mono stating the order: `RANK · <the hub's line for this nest>`, the same words the hub gave, never wrapped into a widow. The clear banner reads `NAME FALLS` — or `NAME'S COURT FALLS` when summoned gods shared the nest.

### Codex
- **Index:** rank headers show their tier as binary ticks in Bare Metal plus a 9px label. Entries are 12px mono. The selected entry gets a gold diamond and a gold underline. A defeated entry gets a filled 2.5px diamond in its pigment, a met-but-undefeated entry a hollow one, and an entry never met reads `? ? ? ? ?` in Worn Steel. The header reads `MET m · DEFEATED n / 26` (20 gods + 6 servitors).
- **Three states:** never met (flat grey silhouette, `? ? ? ? ?`); met (the real portrait in pigment, name, rank, command line, TELL and COUNTER; FIELD NOTE reads "Recovered on the first kill."); defeated (the field note). Every encounter ends in a kill or a lost hull, so meeting is enough to earn the tells.
- **Detail plate:** a corner-ticked tarnished-gold plate. The portrait renders the real sprite through the same draw code, at a registered scale (0.95 for gods, 2.2 for chaff) so sizes compare honestly. The name is in Michroma 18px with a 56×2px underline in its pigment. The TELL label is red, COUNTER is gold, and FIELD NOTE is Bare Metal with its text in Worn Steel, upright: no italic face is bundled, so dimmer ink alone sets the note apart.

### Hostiles (`drawEnemy`, `drawBossShape`)
- **Anatomy:** a hull filled in `body` and outlined in `c` (1.5px, 2px enraged), inner engraving in `dim`, and a small filled core in `c`. Voids are Cold Ground and armour is Armour Plate with a Bare Metal edge.
- **Gods:** the silhouette is the identity (hex, diamond, serpent, eye, star, coil, ram, prism, triad, crown, well, octagon), with rank rings added automatically from `tier`. The name sits above the HP bar in Pale Steel, and the phase label sits below in pigment. Labels are stacked by `calloutY` so rings, bar and name never overlap.
- **HP bars:** a Dim Metal track with a pigment fill (3px for bosses with quarter ticks, 2px for chaff).
- **Boss tracker (`drawBossGuide`):** a pigment chevron and a distance label at the screen edge, so when summoned gods share the field each arrow names its god before the label does.
- **Telegraphs:** red, ruled and ticked (`tickedLine`), and never glowing.

### Sector world layer (`paintWorld`)
Painted once per sector into an offscreen canvas at device density. It holds the deep field past the rim, stars, the one dying star, the motif (`relays`, `shards`, `ring`, `belt`, `veil` or `none`, always 1px in the sector's `motif` tone), the engraved wreckage (`engrave`) and the graduated rim.

### Title (the record cover)
The straight-stroke wordmark sits at 64,96 with a 60px cap height, gold with a ground inline. The subtitle, tagline and intro sit below it. The engraved disc has groove bands every 3px, a gold edge, and a pulsar-map label with binary period ticks. Its single moving part is a slow gold sheen line, which is off under reduced motion.

### Adding things
- **A new god:** add a `PIGMENT_DEF` entry that passes the pigment rules, then run `node test.js`. Draw the silhouette in `drawBossShape` using only `col`, `body` and `dim`, plus Cold Ground for voids and metal for armour. Draw its attacks in red. Rank rings, enraged ticks, codex portrait and hub rings all follow from `tier` and codex state.
- **A new sector theme:** add a `THEMES` entry with a `tint` hue, a `light` angle and a `motif`. `mkSectorPal` derives the palette, and the pigment suite checks the ground and silver edge. A new motif is a new branch in `paintMotif`, drawn only in `P.motif` and `P.faint`.
- **A new menu screen:** draw it over `drawWorldMini`. Put a Display title in gold centred near the top, one 11px Worn Steel key-hint line under it, then `entry()`, `rule()` and tabs for choices, with exactly one committed entry. End with BACK at the standard rect. Reach for a `plate` only when framing a figure or card.

### Motion
Motion is small and always optional. `REDUCED` (prefers-reduced-motion) skips the 900ms pulsar fix on sector entry. It also freezes the portal spin, gem bob, shield-tick rotation, enraged-tick rotation, hub pulse, exit-arrow bob and title sheen, holds the hull-critical frame at 0.8 instead of pulsing, holds the ship at a steady ghost while invulnerable instead of strobing, steadies the engine cuts, and makes the nest inversion instant.

## Do's and Don'ts

### Do:
- **Do** decide whose an element is before choosing its colour: gold for KRIEFNE, red for harm, pigment for a hostile's identity, hydrogen for salvage, metal for wreckage and neutral text.
- **Do** derive every new pigment or sector colour in OKLCH through `mkPigment` or `mkSectorPal`, and keep `node test.js` green.
- **Do** show state with line form: solid for committed, dashed for pending, rings for rank, rim ticks for rarity, a double rule for heavy, ticks for enraged.
- **Do** keep strokes monoline at 1 to 1.5px, and save 2 to 3px for meter fills, heavy rounds and enraged outlines.
- **Do** set world text through `inkText()` and screen text through `heading()` or `mono()`.
- **Do** render codex portraits through the real draw code at the registered scale.
- **Do** gate every looping or decorative motion on `REDUCED`.

### Don't:
- **Don't** put gold on a hostile, or red on a hostile that is not committing.
- **Don't** show a god's pigment on the hub or in the codex before it has been met.
- **Don't** tint wreckage lit edges. They stay bare silver.
- **Don't** add glow, bloom, blur halos, `shadowBlur`, gradients, glass panels or gradient chrome.
- **Don't** use neon cyan or magenta, a grid floor, or NASA-punk costume.
- **Don't** round corners. Circles are fine, rounded rectangles are not.
- **Don't** box menu entries. An entry is a label on a rule, and plates are for figures and cards.
- **Don't** invert any screen except the nest's bonus draft.
- **Don't** set type below 9px Michroma or 10px Martian Mono.
- **Don't** let an irreversible action land on one input: RESTART and NEW RUN arm first, a draft picks on release after a grace, and the end screen waits before RETRY.
- **Don't** use a type glyph (★, !, emoji) as a mark. Rarity is rim ticks and the word RARE; a warning is a drawn reticle.
- **Don't** let a screen say something the live region (`srSummary`) does not. A new screen adds its line there, in the same words the canvas draws.
