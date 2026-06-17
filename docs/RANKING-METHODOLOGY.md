# Rookie Ranking Methodology — MFL League 41969 (2026 Dynasty Rookie Draft)

A specification for codifying the rookie-board ranking logic into the app. This
documents the full reasoning chain, the scoring formula, every parameter and its
provenance, the source citations behind the player-level intel, and the known
limitations. The shipped artifact is `rookie_board_final.json` (265 rows,
`id / name / pos / nfl / rank / tier / remaining / why`).

---

## 0. Design philosophy (read first)

The board is **not** a copy of public consensus. Public rookie ADP/rankings are
built for generic PPR or generic-IDP leagues. League 41969 has three properties
that bend value away from consensus, and the entire model exists to encode them:

1. **Heavy IDP** — 10 of 18 starters are defenders; tackle-weighted scoring.
2. **68 teams × 3 copies per player** — demand for startable bodies is enormous,
   which is what determines *replacement level* and therefore positional value.
3. **Dynasty, 1-QB, full-PPR, TE-premium, rush-attempt points.**

The ranking is a product of four independent inputs, each doing a distinct job:

| Input | Job | Source of truth |
|---|---|---|
| **League data** (uploaded files) | Positional value *structure* — replacement level / scarcity from one season | `player-scores-2025.json`, `rosters-2025.json`, `rules.json`, `players.json`, `available_rookies.json` |
| **History memo** (805 franchise-seasons) | Positional value *priors* — what actually correlated with winning over many seasons | `Positional_Value_and_Scarcity_Memo.pdf` (see §1.5). Outcome-based; **overrides the single-season structure layer where they conflict** |
| **Web research** (post-draft) | Player-level talent / landing spot / role for the 2026 class | Cited below; the 2026 NFL Draft post-dates the model's training cutoff, so this MUST come from research, not priors |
| **Analyst weighting** | Turning the above into numbers (multipliers, bumps, tiers) | Judgment — the part to scrutinize / make configurable |

**Key principle for the build agent:** keep the layers separate in code. The
positional-value structure is *derived from one season of data* and should be
recomputed when new scores arrive. The history memo is a *multi-season outcome
prior* and is the stronger evidence where the two disagree (bigger sample, ties
directly to winning rather than to a replacement proxy). The player-intel layer
is *research-fed*. The weighting layer is *config* — expose the `LEV` multipliers
and bumps as tunable parameters, not hard-coded magic numbers.

> Reconciliation rule used in the current board: **the history memo is given full
> weight where it differs from the single-season curves.** The two agreed on the
> spine (RB/LB premium; CB/S/DT churn) and the memo corrected the two positions
> the single-season read got thin — TE (up) and DE (down). See §1.5.

---

## 1. The positional-value layer (derived from league data)

This is the load-bearing insight and the thing that most differentiates the
board from consensus. It answers: **for each position, how much does an elite
player gain you over a freely-available replacement, given this league's
starting demand and the 3-copy rule?** Steep drop = draft early. Flat = stream.

### 1.1 How replacement level was computed

- Source: `player-scores-2025.json` — 2025 per-player season scoring **already
  computed under league 41969's own rules** (`scoringRulesApplied: true`), with
  per-week splits.
- Per-game (PPG) = mean of weekly scores, restricted to players with ≥4 games
  (removes tiny-sample noise). Per-game is the right unit because replacement =
  "what a streamer gives you in a given week."
- **Demand** per position = (avg starters/team) × 68 teams. With grouped lineup
  slots, DL = DT+DE pooled, DB = CB+S pooled.
- **3-copy adjustment (critical):** each NFL player fills up to 3 roster slots,
  so the number of *unique* NFL players that must clear the startable bar =
  (league-wide starting slots) ÷ 3. Replacement level = the PPG of the unique
  player at that demand rank.
- **Roster norms** were measured, not assumed, from `rosters-2025.json`
  (end-of-season week-22 snapshot, 68 franchises, avg roster 37.6).

### 1.2 The measured curves (2025, league-scored, 3-copy demand)

| Pos | Elite PPG | Replacement PPG | Retain % (repl/elite) | Draft leverage (top12 − repl) | Supply vs demand |
|---|---|---|---|---|---|
| **LB** | 20.8 | 5.2 | 25% | **11.8** | tight (127 needed / ~187 viable) |
| **RB** | 30.4 | 8.4 | 28% | 10.8 | tight (116 / ~134) |
| **QB** | 27.7 | 18.4* | 66%* | 3.7* | **EXHAUSTED** (see §1.3) |
| WR | 23.4 | 8.0 | 34% | 7.1 | deep (160 / ~216) |
| TE | 24.5 | 8.4 | 34% | 6.0 | adequate (71 / ~128) |
| DE | 23.0 | 11.3 | 49% | 5.8 | deep |
| DT | 23.2 | 10.2 | 44% | (DL 5.8) | deep (70 / ~170) |
| S | 18.3 | 12.8 | 70% | (DB 3.5) | deep (83 / ~158) |
| CB | 17.5 | 12.1 | 69% | (DB 3.5) | very deep (61 / ~191) |

Lower retain % = steeper cliff = more premium. Higher leverage = draft earlier.

**Conclusions the data forces (these drive the multipliers in §2.2):**
- **LB is the single most premium position** — steepest cliff AND highest
  leverage, because you start 4+/team (tripled by copies) and three-down tackle
  producers are scarce. Rookie LBs are top-priority, not "good IDP value."
- **RB is the premium offensive position**; WR/TE moderate; replacement craters.
- **DT scores big but is replaceable** — elite DL ~23 PPG, but the pool is deep
  and replacement still ~10. Confirmed the manager's intuition. Do NOT spend
  early capital on rookie DTs (compounded by a weak 2026 interior class).
- **Secondary (CB, then S) is the most replaceable** — nearly flat curves. CB
  most, S barely behind. Rookie DBs are positional fades regardless of talent.

### 1.3 The QB exception (worked through carefully — it reversed twice)

QB needs special handling and is the most counterintuitive result.

- Naive one-QB-per-team read → QB looks low-leverage (retain 66%). **Wrong.**
- Reality from `rosters-2025.json`: teams roster **3.04 QBs each** (median 3;
  distribution {1:5, 2:19, 3:24, 4:15, 5:1, 6:2, 7:1, 8:1}). That's **207 QB
  roster slots** league-wide.
- 207 ÷ 3 copies = **69 unique NFL QBs demanded**, against ~58 that score at all
  and ~23–32 startable. **Demand exceeds the entire viable supply.** Every QB
  with a pulse is owned 3× before one reaches waivers. There is no QB streaming
  and barely a QB bench market.
- Therefore QB is a **scarcity-cliff** position: shallow gap among the haves,
  catastrophic drop for have-nots (QB23 = 18.4 PPG, QB50 = 2.3). Young QBs with
  a starting path are scarce dynasty assets.
- **But** it's still 1-QB (you need one starter, not a weekly stack of four like
  LB), so QB leverage is a *one-slot* cliff vs LB's *four-slot* compounding
  cliff. Net: QB is a high multiplier, below LB/RB, above the streamable
  positions. Encoded as `LEV['QB'] = 0.78` here; later trimmed to 0.74 by the history memo (see §1.5).

> Build-agent note: the QB result is entirely dependent on the 3-QB roster norm
> and the 3-copy rule. If either changes (roster cap, copy count), recompute.
> Expose roster-norm and copies as inputs.

### 1.5 History memo — multi-season outcome priors (overrides §1.2 where conflicting)

Source: `Positional_Value_and_Scarcity_Memo.pdf` — an independent study of **805
franchise-seasons (2019–2025, EFA/EDSL/MLS)** measuring which *position rooms*
actually correlated with winning (top-quartile room → all-play win-rate lift),
plus trade-price and replaceability (waiver + late-rookie 150+ hit rates). This
is **stronger evidence than §1.2** for positional priors: it's a much larger
sample and ties to winning directly, not to a single-season replacement proxy.
Where the two disagree, the memo wins (current board: full weight).

Memo headline numbers (all-play win-rate lift from a top-quartile room):

| Pos | Win-lift | Trade price | Waiver 150+ | Late-draft 150+ | Memo read |
|---|---|---|---|---|---|
| RB | 19.8 | 135.3 | 1.2% | 5.5% | Primary spend |
| LB | 18.8 | 107.6 | 5.8% | 3.1% | Primary spend — **underpriced** |
| TE | 14.4 | 97.0 | 1.7% | **0.0%** | Scarcity spend — **underpriced, unrepairable late** |
| WR | 13.0 | 134.4 | 1.1% | 2.2% | Primary spend (expensive but earns it) |
| S | 10.9 | 69.3 | 24.5% | 28.5% | Churn / opportunistic |
| QB | 10.3 | 106.6 | 3.0% | 8.3% | Anchor spend — **don't stockpile depth** |
| DE | 7.2 | 129.6 | 16.4% | 4.7% | **Likely overpay** — selective only |
| DT | 5.7 | 77.3 | 21.9% | 3.3% | Churn / patchable |
| CB | **-2.7** | 59.6 | 34.5% | 43.4% | **Do not pay** (only negative room) |

Star-power note (memo §2): a 400+ RB was the cleanest single-star signal (+22.0);
a 300+ TE was powerful (+18.3); WR/LB rewarded **room depth over one hammer**;
400+ QB helped only modestly (+12.2). True-position era (post-2021) did not change
the hierarchy — LB still crushed DE (19.0 vs 6.1).

**How it reconciled with §1.2 (what changed vs the single-season-only board):**
- **Agreement (no change):** RB & LB premium on top; CB, S, DT are churn/fades.
  Both methods land here, which is the strongest possible signal.
- **TE → UP** (`LEV` 0.53 → **0.66**): memo win-lift 14.4 > WR, and TE is the
  hardest room to repair late (0% late-draft 150+). Single-season curves had
  under-rated it. Biggest upward move on the board.
- **DE → DOWN** (`LEV` 0.50 → **0.42**): documented overpay — 3rd-priciest trade
  asset but only 7th in win-lift, weak even post-2021. Edge tier discounted.
- **QB → slight trim** (`LEV` 0.78 → **0.74**): memo warns against luxury QB
  depth, so the multiplier eases — **but** the in-league acquisition scarcity from
  §1.3 keeps QB high overall (the memo measures *production swing*; §1.3 measures
  *acquisition scarcity* — both true, not in conflict). Net: secure ONE anchor
  QB high, don't stack QB2/QB3. (Also reflects manager's stated mild QB lean.)

> Build-agent note: treat the memo as a **positional-prior config layer** feeding
> `LEV`. If a future memo (more seasons / this league specifically) supersedes it,
> swap the priors and recompute `LEV`; don't touch the formula or player bumps.

---

## 2. The scoring formula

### 2.1 Per-player inputs

- **Market prior** `mv` from rookie ADP (`available_rookies.json: avgPick`),
  decayed: `mv = exp(-(avgPick - 1) / 40)`. Players with no ADP → `mv = 0`.
  Rationale: ADP is one (IDP-aware) market signal; useful but not authoritative,
  so it's down-weighted vs capital and never used alone.
- **Draft capital** `cv` from NFL draft slot (`players.json: draft_round`,
  `draft_pick`). Approx overall pick `op = (round-1)*32 + pick`, decayed:
  `cv = exp(-(op - 1) / 60)`. UDFA / no capital → `cv = 0`. This is the primary
  dynasty signal, especially for the deep no-ADP IDP pool.
- **Positional leverage** `lev` from §1 (the VORP curves). See §2.2.
- **Research bump** `bump` — additive adjustment for landing spot / role / talent
  from the cited research (§3). This is the only place player-specific scouting
  enters.

### 2.2 Positional leverage multipliers (`LEV`)

Derived from §1.2 leverage, normalized so LB = 1.00, then **reconciled with the
history memo §1.5** (TE up, DE down, QB trimmed; RB/LB/CB/S/DT unchanged because
both methods agree):

```
LB 1.00 | RB 0.94 | QB 0.74 | TE 0.66 | WR 0.62 | DE 0.42
S 0.33 | DT 0.30 | CB 0.26 | PK/PN/XX 0.00
```

> Provenance per value: LB/RB/WR from §1.2 single-season leverage (memo confirms).
> TE 0.66 and DE 0.42 are memo-driven overrides (§1.5). QB 0.74 = §1.3 scarcity
> minus the memo's "no luxury depth" trim. CB/S/DT from §1.2, memo-confirmed.
> This block is the single most important config surface — change it here and the
> whole board re-derives.

### 2.3 The composite

```
talent = 0.50*mv + 0.50*cv
base   = (0.55*talent + 0.10*mv) * (0.55 + 0.45*lev)
score  = 100 * (base + bump)
```

- `talent` blends market and capital equally (dynasty leans on capital; the
  extra `+0.10*mv` term gives ADP a small independent voice for well-covered
  offensive players).
- `(0.55 + 0.45*lev)` scales talent by positional leverage but never below 55%
  of full credit — so a truly elite talent at a weak-leverage position still
  ranks, just discounted (this is why Caleb Downs lands ~30, not buried at 60+).
- `bump` is added *after* the leverage scaling so research adjustments are not
  themselves diluted by position.

### 2.4 Tiers (by overall rank)

```
T1: 1–5 | T2: 6–13 | T3: 14–25 | T4: 26–45 | T5: 46–75 | T6: 76–130 | T7: 131–265
```

### 2.5 Worked examples (match the shipped board exactly)

| Player | Pos | ADP | Capital | mv | cv | lev | base | Notes |
|---|---|---|---|---|---|---|---|---|
| Arvell Reese | LB | 18.5 | R1.5 | .646 | .936 | 1.00 | .499 | +0.30 bump → board #1 |
| Ty Simpson | QB | 21.1 | R1.13 | .605 | .819 | 0.74 | .399 | +0.18 bump (QB scarcity, trimmed per memo) → #3 |
| Max Klare | TE | 36.9 | R2.29 | .413 | .415 | 0.66 | .288 | +0.12 bump (TE scarcity, memo) → #10 (up from 18) |
| Omar Cooper | WR | 14.1 | R1.30 | .721 | .617 | 0.62 | .365 | +0.10 bump → #6 |
| David Bailey | DE | 24.1 | R1.2 | .564 | .940 | 0.42 | .314 | +0.14 bump (talent), DE capped per memo → #5 |
| Caleb Downs | S | 23.8 | R1.11 | .566 | .846 | 0.33 | .311 | −0.10 bump (S fade) → #30 |
| Caleb Banks | DT | 55.4 | R1.18 | .257 | .753 | 0.30 | .208 | no bump (DT fade) → #31 |

Note how Downs and Banks have strong *talent* (.706, .505) but the low `lev`
multiplier pulls them down; conversely Klare's modest talent is lifted by the
memo-driven TE multiplier — the positional layer is doing exactly its job.

---

## 3. Player-intel layer: research bumps + source citations

The 2026 NFL Draft (April 2026) post-dates the model's training cutoff, so all
landing spots, draft capital, and roles came from web research. Bumps below are
the only player-specific overrides; everything else flows from formula + data.

### 3.1 Bumps applied (by MFL id)

| id | Player | Pos | Bump | Reasoning (from sources in §3.2) |
|---|---|---|---|---|
| 17556 | Arvell Reese | LB | +0.30 | Three-down LB, top-10 capital, off-ball role; LB = top league leverage |
| 17558 | CJ Allen | LB | +0.25 | Colts cleared BOTH LB starters (226 tackles vacated), named him "the Mike" — elite path |
| 17560 | Anthony Hill Jr. | LB | +0.16 | Clear path next to Cedric Gray (TEN); some analysts argue top-tier |
| 17586 | Jacob Rodriguez | LB | +0.16 | 3-down talent but behind Brooks/Dodson (both expiring) — patience / ~2027 |
| 17589 | Josiah Trotter | LB | +0.08 | Box thumper / run-defense (fits tackle scoring); blocked by Anzalone/Rozeboom |
| 17571 | Jake Golday | LB | +0.02 | Well-rounded but Flores scheme + behind Cashman/Wilson, slot usage — 2027 bet |
| 17629 | Bryce Boettcher | LB | +0.10 | Day-3 capital but thin Colts depth = best Day-3 LB snap path; LB premium |
| 17587 | Derrick Moore | DE | +0.06 | Good DET landing per analysts; rotational edge w/ run-down tackle upside |
| 17568 | Akheem Mesidor | DE | −0.04 | Talented edge but LAC landing flagged as fit/role concern |
| 17551 | David Bailey | DE | +0.20 | #2 overall edge, elite get-off; boom big-play DE, snaps Day 1 |
| 17502 | Omar Cooper Jr. | WR | +0.10 | Best WR available, R1 capital — but shares targets w/ Wilson, Sadiq, Hall + Jets QB flux |
| 17463 | Ty Simpson | QB | +0.20 | R1 QB (Rams, behind Stafford); QB pool exhausted league-wide — scarce hold |
| (name) | Carson Beck | QB | +0.16 | R3 QB (Cardinals); QB demand > supply makes even a dart worth holding |
| 17563 | Caleb Downs | S | −0.10 | Blue-chip S talent, but secondary is refillable in dynasty — positional fade |
| 17477 | Jonah Coleman | RB | −0.02 | Committee RB, low (R4) capital; goal-line/volume helps in rush-attempt scoring |
| (name) | Nicholas Singleton | RB | +0.04 | Volume RB, TEN not sold on Pollard long-term; low capital is the risk |
| (name) | Max Klare | TE | +0.05 | Receiving TE in TE-premium (1.5/rec) |

All other players: `bump = 0`, ranked on formula alone.

### 3.2 Sources

**2026 NFL Draft results / landing spots / capital**
- NFL.com — draft tracker & Round 1 winners/losers (Bain to TB #15, Simpson to LAR #13, etc.)
- ESPN — draft picks by round
- CBS Sports — team grades; top-5 by defensive position (Woods as 3-tech, McDonald nose, Miller, edge order Bain/Reese/Bailey)
- Yahoo Sports — Round 1 grades (Mendoza #1 Raiders, Jets pass rusher, Faulk value, Woods next to Chris Jones)

**Offensive dynasty consensus**
- DraftSharks — 2026 dynasty rookie rankings (Love→Cardinals #3, weak class framing, WR/RB landing spots, Sadiq Jets slot role)
- CBS Sports — updated dynasty rookie top-50 (Beck rises; ordering of WR/RB tier); dynasty rookie mock (Cooper/Sadiq Jets, Williams WAS WR2 behind McLaurin, Mendoza 1-QB value)
- RotoBaller — post-draft dynasty rookie rankings (Kaelon Black 49ers profile)
- FantasySP — top-20 offensive playmakers (Cooper target competition, Lemon, Concepcion)
- DataForceFF — post-draft outlooks (Concepcion WR1 path CLE, Coleman muddies DEN backfield/goal-line, Singleton early-2nd)
- KeepTradeCut — current rookie rankings/values (Cooper, Boston WR44, Coleman RB34 tiers)

**IDP rookie research (weighted heaviest — league is IDP-centric)**
- The IDP Show (theidpshow.com) — rookie rankings & tiers (Styles IDP1 tackle-heavy, Reese balanced, Bailey big-play); position model articles for edge, DT, safety, LB; podcast best/worst landing calls (CJ Allen BEST, Rodriguez WORST, Thieneman BEST, Mesidor WORST, Derrick Moore BEST)
- FootballGuys — top-40 IDP rookies (Styles 3-down, Downs DB1, Trotter TB tone-setter, Thieneman versatile)
- DraftSharks — dynasty IDP rookie rankings (class strength, Allen "the Mike"/Colts, Rodriguez tied, IDP falls too far in drafts)
- Dynasty Nerds — mixed IDP rookie draft & winners/losers (Downs 1.12 surprise, Allen Colts reset/226 tackles, Golday MIN concern/Flores vets)
- PFF — rookie prospect models for safety (Downs blue-chip, Thieneman/McNeil-Warren next), DT (Woods/Banks taxi stashes), LB
- Fantasy In Frames — LB risers/fallers (Styles elite testing, landing-spot chaos avoidance)
- Windy City Gridiron — combined offense+IDP rookie ADP (closest comp to this league type; "tackles valuable but penetrating DT vs nose" distinction, weak DT class)
- DLF (Dynasty League Football) — IDP rookie class review (DT true-position guidance, Hill Jr. Tier-1 argument)
- Footballguys / sethburn / WalterFootball — DT class ratings (Woods #1 DT but slid, McDonald nose, Banks, Faulk tweener)

### 3.3 Source-conflict notes (flag for the build agent)
- **Arvell Reese's exact team/role** had conflicting reporting across sources;
  resolved toward high capital + off-ball three-down usage rather than committing
  to a disputed depth-chart claim. Re-verify before trusting the landing detail.
- A pre-draft (Dec 2025) mock had several **wrong** landing spots (Cooper→Bills,
  Love→Vikings, etc.). Only post-draft sources (late-April 2026 onward) were used
  for actual landing spots. Ignore pre-draft mocks for landing data.
- Some players are **already drafted in-league** (Love, Tate, Tyson, Lemon,
  Concepcion, Sadiq, Stowers, Styles, Mendoza, Price) and are absent from
  `available_rookies.json`. Research on them informs context but they're not on
  the board.

---

## 4. Data artifacts the model consumes

| File | Used for |
|---|---|
| `available_rookies.json` | Board universe (265), MFL ids (join key), ADP, copies remaining |
| `players.json` | NFL draft round/pick (capital), college |
| `player-scores-2025.json` | Replacement-level / VORP curves (league-scored 2025 PPG) |
| `rosters-2025.json` | Measured roster norms (esp. 3.04 QB/team) → QB scarcity |
| `rules.json` | Confirms scoring (DT 3.5 / DE 3.0 solo, CB PD 3, TE 1.5/rec, RA 0.25) |

---

## 5. Limitations (state these in the app; do not over-trust the board)

1. **Pre-snap projections.** No 2026 NFL games have been played. Rankings blend
   talent/capital/landing with positional value; they are not stat projections.
2. **Weighting is judgment.** The `LEV` multipliers, bump sizes, and tier cuts
   are calibrated to the data but are analyst choices. Expose them as config.
3. **Mid-tier (T3–T4) edge/WR groups** lean more on draft capital than on tape;
   the highest-value next research pass is position-by-position scouting there.
4. **Snapshot.** `remaining` reflects the draft state at data-pull time; it goes
   stale as picks are made (the live app should refresh it).
5. **Replacement curves use 2025.** Recompute when newer league-scored seasons
   exist; positional value can shift with rule or roster-setting changes.
6. **Most contestable single call:** Caleb Downs faded to ~28 (blue-chip safety,
   low positional leverage) and Ty Simpson lifted to ~3 (QB scarcity structure).
   Both are defensible from league data but are the first knobs to revisit.

---

## 6. Suggested config surface for the app

Expose these so the board can be re-derived rather than hard-coded:

- `copies_per_player` (currently 3), `num_teams` (68)
- `roster_norms` per position (measured; QB=3.04 is the sensitive one)
- starter demand per lineup slot/group
- `LEV` multipliers (or recompute from a fresh `player-scores` file)
- decay constants: market 40, capital 60
- blend weights: talent 0.50/0.50, base `0.55*talent + 0.10*mv`, leverage floor
  0.55 / range 0.45
- tier breakpoints
- the research-bump table (the human-/research-editable layer)
