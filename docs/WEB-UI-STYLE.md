# Web UI — Style Decisions (handoff for styling iteration)

The entire UI is **one file**: [`public/index.html`](../public/index.html) — inline
`<style>` + vanilla JS, no framework, no build step. All theming is driven by CSS
custom properties in `:root`, so a full re-skin is mostly swapping those vars.
**Function is settled; this doc is purely about the look.** Iterate freely on
aesthetics — just keep the DOM hooks the JS relies on (see "Don't break" below).

---

## Aesthetic direction chosen

**Dark "tactical draft war room."** Near-black canvas, faint engineering grid,
one hot accent for urgency, semantic status colors. Picked for a phone tool used
under a clock: high contrast, glanceable, data-forward. It's intentional, but see
"The Claude tells" — it's also a very *on-brand-for-the-model* choice, so if you
want a different personality (editorial, light/refined, retro-sports, brutalist
ticket-stub, etc.), that's wide open.

## Design tokens (`:root`) — the re-skin surface

```
--bg:    #0a0b0d   near-black canvas
--panel: #14161a   card/hero surface
--panel2:#181b21   inset (buttons)
--line:  #262a32   borders + grid lines
--txt:   #eceef1   primary text
--mut:   #868b95   secondary text
--dim:   #5a5f69   tertiary / disabled
--take:  #ff5d2e   urgent (orange-red)   ← also --clock (on-the-clock accent)
--lean:  #ffc23d   caution (amber)
--wait:  #34d27b   safe (green)
--mono:  "JetBrains Mono"   data, labels, numbers
--disp:  "Archivo"          names, headings, body
```

Swap these and most of the theme moves with them. The three semantic colors
(`take`/`lean`/`wait`) are load-bearing — they color both the status chip and the
survival bar, encoding the decision at a glance.

## Typography

- **Two families, deliberate split:** `Archivo` (display — weights 500/700/900)
  for player names and the hero; `JetBrains Mono` for anything data-ish (labels,
  pick numbers, %s, pos·team, chips). The mono ↔ display contrast is the main
  "character" of the type system.
- **Mono labels are UPPERCASE + letter-spaced** (`.1–.16em`) — eyebrows, chips,
  section headers. Display headings are tight (`letter-spacing: -.02em`), big,
  heavy (900 hero, 700 names).

## Layout & structure

- Phone-first, `max-width: 560px`, centered. `100dvh`, safe-area insets for notch.
- **Sticky header** (brand · live dot · pick counter · DRY RUN badge) with a
  fade-to-bg gradient.
- **Hero panel** — the state banner. Two variants: default ("On the clock:
  Franchise X / your pick in N") and `.hero.me` (orange glow, blinking eyebrow,
  "You're on the clock"). This is the biggest single visual moment.
- **Candidate cards** stacked vertically. Anatomy: rank chip · name · `pos · team`
  · status chip (top row); copies-left dots · survival bar + % (stats row); `why`
  (dashed-top footnote); full-width Draft button.
- **Confirm bottom-sheet** — slides up from the bottom for the pick confirmation.

## Background & texture

- Two layered linear-gradients form a **38px engineering grid**; a fixed radial
  **vignette** (`body::before`) fades the grid out toward the edges so it reads as
  texture, not a spreadsheet. This is the main "atmosphere" device.

## Motion (all CSS)

- Live dot: pulsing `ping` ring (2.4s).
- Cards: staggered rise-in on load (`animation-delay: i*55ms`).
- On-the-clock eyebrow: `blink` (steps(2), 1.4s).
- Survival bar: animated `width` transition (.6s).
- Bottom-sheet: slide-up (.25s); buttons: `:active` scale-down.
- Hero (me): orange box-shadow glow.

## The "Claude tells" (so you can diverge intentionally)

This design has a recognizable model-default fingerprint. If you want it to stop
"looking like Claude," these are the things to change:
1. **Dark near-black + a single hot accent** (here orange-on-near-black).
2. **Monospace for anything technical** + uppercase letter-spaced micro-labels.
3. **Faint grid / dotted texture** background with a vignette.
4. **Semantic traffic-light chips** (red/amber/green) with translucent fills +
   1px colored borders.
5. **Staggered fade-up entrance** animation on load.
6. **Rounded panels (12–14px) on a darker canvas, 1px hairline borders.**

None are wrong — they're just the house style. A light/editorial sports-almanac
look, a print-ticket aesthetic, or a bold maximalist team-colors treatment would
all read as deliberately *not* that.

## Don't break (JS contracts)

The script in the same file depends on these — keep them when restyling:
- IDs: `#hero`, `#list`, `#prog`, `#dry`, `#hint`, `#foot`, `#sheet`,
  `#sheetPanel`; per-card button id `draft-<playerId>`.
- Classes the JS toggles/reads: `.hero.me`, `.card.actionable`, `.sheet.open`,
  chip class = the call (`take|lean|wait`).
- `render(board)`, `card(c,i,me)`, `confirmPick`, `submitPick`, `load()` are the
  render pipeline; restyling = change markup/CSS they emit, not the data flow.
