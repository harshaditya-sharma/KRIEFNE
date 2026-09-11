---
version: 1
slug: "game-js"
primary_target: "game.js"
related_targets: ["index.html","styles.css"]
---

# KRIEFNE: the whole game surface (canvas)

Scope: every visible surface of the game, which is all canvas-drawn in `game.js`, plus the page around it (`index.html`, `styles.css`): title and wordmark, galaxy hub, sector playfield, HUD, draft, pause, settings, help, codex, game over, boss warning, all sprites, bullets, salvage, telegraphs.

Mode: playfield Experience; HUD, menus and draft Operate; codex and help Read.

Audience and job: genre players at a desk in a dim room, long keyboard-and-mouse runs; read threats at speed, draft, navigate menus mid-run.

Boundaries: gameplay, balance, timings, hitboxes, controls, flow and lore copy are untouched. The only copy edits are factual colour words in TELL and help lines that the new palette would make false. `node test.js` must stay green.

Anti-goals: grid floor, neon cyan/magenta, glow, bloom, blur halos, glass panels, rounded tiles, gradient chrome, a box around every menu item, NASA-punk costume.

Deferred: the binary easter egg under the wordmark (lore forbids expanding the name before S100).

## Direction contract

THESIS: KRIEFNE is drawn as the engraved cover of the record it carries: hairline diagrams, tick marks and binary counts, instructions for strangers. It refuses the category default of neon lines glowing on black.

OWN-WORLD: cold near-black ground. Gold = KRIEFNE, home and its instrument (never an enemy). Oxide red = everything hostile. Hydrogen blue-white = salvage only. Bare-metal silver = wreckage and neutral text. Every mark is a monoline engraved stroke; light is expressed by line density and hatching, never glow. Wide monoline engraver's capitals plus a narrow tabular technical face. Rank = rings, rarity = rim ticks, heavy = double rule. The committed choice is the only solid line; the rest are dashed. One light per sector. Codex portraits at a registered scale. Inversion to gold field and black engraving only on the nest's hoard recovery.

STORY: a lone human-built machine crosses a dead universe, cataloguing ancient gods; the interface is its own engraved instrument.

FIRST VIEWPORT: the title as the record cover. An engraved grooved disc bleeds off the right edge; the straight-stroke KRIEFNE wordmark sits left with radial pulsar lines; CONTINUE and NEW RUN are engraved labels on rules (committed one solid gold with a marker, the other dashed); settings, codex and help sit as small engraved entries below. The primary action is the top label.

FORM: Etched Record (Voyager Golden Record cover engraving), position 1 on the ordered list, chosen as IMPECCABLE'S PICK; seed 201585d9.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
