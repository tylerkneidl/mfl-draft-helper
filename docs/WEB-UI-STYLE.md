# Web UI — Style Decisions (handoff for styling iteration)

The entire UI is one file: `public/index.html` — inline `<style>` + vanilla JS, no framework, no build step. All theming is driven by CSS custom properties in `:root`, so a re-skin is mostly swapping those vars plus some structural CSS. Function is settled; this doc is about the look. The reference implementation of this direction is `mockup-mashup-vice-stub.html` (phone-width, real card anatomy, all JS hooks present) — lift its tokens and markup onto the existing `render()` / `card()` output rather than replacing the file.

## Aesthetic direction chosen

"Vice Stub" — Miami Vice neon on a retro ticket-stub skeleton. A draft war room for a phone, used under a clock. The structure is a vintage sports ticket stub (perforated rank stub, box-score numerals, stamped status) kept quiet and glanceable; the personality is 1980s Miami at dusk — flamingo magenta, sunset amber, Art-Deco cyan glowing against a deep plum night. Boldness is spent in exactly one place: the hero scoreboard, which ignites with a neon sunset glow when you're on the clock. Everything you actually read (the candidate list) stays calm pastel-on-dusk so it scans fast.

This is a deliberate move off the previous dark-tactical look, which carried the common model-default fingerprint (near-black + single orange accent, monospace for all data, engineering-grid + vignette texture, translucent traffic-light chips, staggered fade-up). See "How this diverges" below.

## Design tokens (`:root`) — the re-skin surface

```
--dusk:   #181030   deep plum night — canvas
--dusk2:  #211741   card surface (ticket stock, at night)
--stub:   #2a1d54   perforated stub column
--line:   #3f2e6e   perforation + hairline borders
--txt:    #f6eeff   primary text
--mut:    #bda6e4   secondary text
--dim:    #735fa6   tertiary / disabled
--take:   #ff2d95   urgent — hot flamingo magenta   (chip + survival fill)
--lean:   #ffab33   caution — sunset amber          (chip + survival fill)
--wait:   #19dccb   safe — Art-Deco cyan            (chip + survival fill)
--gold:   #ffd36e   rank numerals, copies dots, default Draft button
--violet: #8268ff   secondary neon (gradients/accents)
--disp: "Saira Condensed"   names, hero, buttons, labels (display)
--slab: "Zilla Slab"        data: rank, %, pick numbers (box-score numerals)
--body: "Hanken Grotesk"    why-footnote + running text
--neon: "Monoton"           the hero eyebrow only (used once, on purpose)
```

Swap these and the theme moves with them. Load-bearing: the three semantic colors (`take` magenta / `lean` amber / `wait` cyan) drive both the status chip and the survival bar — they encode the draft decision at a glance, so keep a clear three-way distinction even if you retune the hues. Note the intentional inversion: `wait` is cyan, not green — it's safe and unmistakably Miami.

## Typography

- Three faces, one job each (replaces the old Archivo + JetBrains-Mono pair):
  - `Saira Condensed` (600–800), athletic/jersey condensed — names, hero, buttons, uppercase micro-labels. The condensed display is the type system's "voice."
  - `Zilla Slab` (600–700) for numerals/data — rank, survival %, pick counter. A slab with `font-variant-numeric: tabular-nums` gives box-score alignment without the monospace-for-data tell.
  - `Hanken Grotesk` for the `why` footnote and any running prose — warm, readable.
- Display headings: heavy, tight, occasional italic on the hero (the only italic).
- Micro-labels ("COPIES", "RANK"): uppercase, letter-spaced `.1–.14em`, in Saira (not mono). Keep them small and dim.

## Layout & structure

- Phone-first, `max-width: 560px`, centered. `100dvh`, safe-area insets for notch.
- Sticky header — brand (METROSTARS, the bold half a magenta→cyan gradient) · pulsing live dot · pick counter (`#prog`) · DRY RUN badge (`#dry`).
- Hero (`#hero`) — the one maximalist moment. Plum panel with magenta/cyan light bleeding from the corners and a signature horizon stripe along the bottom (magenta→amber→cyan gradient, the "sunset"). Default state is calm; `.hero.me` ignites — magenta border, outer neon glow, the Monoton eyebrow blinks. This is the biggest single visual beat; nothing else competes with it.
- Candidate cards (`#list`) — ticket stubs, kept quiet. Anatomy: a left perforated stub (2px dashed divider + cut-out notches) holding the big gold rank numeral; the body holds name (Saira) · `pos · team · capital` (Zilla) · stamped status chip (top row); then a stats row — copies-left dots (gold bulbs) + survival meter & % ; the `why` footnote under a dashed rule; a full-width Draft button (gold default, magenta + glow when `.actionable`).
- Confirm bottom-sheet (`#sheet` / `#sheetPanel`) — slides up, magenta top border, for pick confirmation.

## Texture & signature

- No engineering grid, no vignette. Atmosphere comes from the hero's corner-bleed neon light only — the list sits on flat dusk for readability.
- Signature element: the sunset horizon stripe on the hero (the magenta→amber→cyan gradient line) — it's the Vice sunset and a visual key to the three semantic colors, so the palette teaches itself. Reuse it sparingly (e.g., a thin version on the confirm sheet) but don't scatter it.
- Cards read as tickets via the perforated stub + notch cut-outs, not via added decoration.

## Motion (all CSS, keep minimal)

- Live dot: pulsing `ping` ring (2.4s).
- `.hero.me`: neon box-shadow glow + blinking Monoton eyebrow (`blink`, 1.4s).
- Cards: quick deal-in (short translateY + fade, ~.35s) — deliberately not a long staggered fade-up cascade.
- Survival bar: animated `width` (.6s ease).
- Bottom-sheet: slide-up (.25s); buttons: `:active` scale-down (stamp press).
- All wrapped in `@media (prefers-reduced-motion: reduce)`.

## How this diverges from the model-default look (on purpose)

Previous look → Vice Stub:

1. Near-black + single orange → plum dusk + flamingo/amber/cyan triad.
2. Monospace for all data → slab numerals (tabular-nums) + condensed display.
3. Engineering grid + vignette → corner-bleed neon on the hero only, flat list.
4. Translucent traffic-light chips w/ 1px borders → solid neon chips (and the stub keeps a stamped feel).
5. Staggered fade-up cascade → quick deal-in.
6. 12–14px rounded panels, hairline borders → ticket-stub cards w/ perforation + notches; the one rounded showpiece is the hero.

## Don't break (JS contracts)

The script in the same file depends on these — keep them when restyling:

- IDs: `#hero`, `#list`, `#prog`, `#dry`, `#hint`, `#foot`, `#sheet`, `#sheetPanel`; per-card button id `draft-<playerId>`.
- Classes the JS toggles/reads: `.hero.me`, `.card.actionable`, `.sheet.open`, status chip class = the call (`take` | `lean` | `wait`); survival fill uses the same call class.
- `render(board)`, `card(c,i,me)`, `confirmPick`, `submitPick`, `load()` remain the render pipeline — restyling means changing the markup/CSS they emit, not the data flow. The mockup's markup is structured to map onto `card(c,i,me)` output: stub→rank, body→name/pos/chip/stats/why/button.

## Optional next steps (not blocking)

- A daytime Deco light variant (flamingo/mint/sand/chrome on light) exists as an idea if a light mode is ever wanted — would be a second token set, same DOM.
- The survival meter could gain segmented "scoreboard bulb" ticks if you want more retro-hardware character; current solid fill is the calm default.
