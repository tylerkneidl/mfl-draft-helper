# In-Draft Decision Logic — MFL League 41969

Companion spec to `RANKING-METHODOLOGY.md`. The ranking board answers *who is
best*. This document specifies the **live, on-the-clock decisions**: should I
take the player now or will he fall to my next pick, and should I trade up or
down (and at what price). This is dynamic logic that runs against draft state,
not a static list.

The board is the **value input**; this layer turns value into **action** given
(a) remaining copies, (b) pick distances, (c) who else is likely to want a
player. Keep it separate from the ranking code.

---

## 0. League structure that drives everything here
- **68 franchises, linear (`SAME`) order** — same draft slot every round, NOT a
  snake. Round R, slot S → overall pick `(R-1)*68 + S`.
- **3 copies of every player** (`rostersPerPlayer: 3`). Availability is *copies
  remaining* (0–3), not taken/untaken. A player is gone only when all 3 copies
  are drafted.
- This is the manager's franchise: **0042 (NY/NJ MetroStars)**.

### 0.1 The manager's picks (overall #, and gap to next)
| Pick | Overall # | Picks until your next |
|---|---|---|
| 1.45 | 45 | 20 |
| 1.65 | 65 | 6 |
| 2.03 | 71 | 42 |
| 2.45 | 113 | 2 |
| 2.47 | 115 | 24 |
| 3.03 | 139 | 47 |
| 3.50 | 186 | 21 |
| 4.03 | 207 | 49 |
| 4.52 | 256 | — |

**Implication:** the "will he fall?" question matters most before the **long
gaps** — after 2.03 (42 picks until 2.45), after 3.03 (47), after 4.03 (49),
after 3.50 (21), and after 1.45 (20). Before the **back-to-back picks** (2.45→
2.47 is 2 apart; 1.65→2.03 is 6), you can often grab one player and reasonably
expect a similar-value one to survive the short gap — so don't overpay to move.

---

## 1. Copies-remaining logic
With 3 copies, a player's effective "scarcity clock" is faster than it looks,
because each pick by *any* of 68 teams can burn a copy.

- **`remaining` field** (from `available_rookies.json`) = copies left (0–3).
- A player is **available to you** iff `remaining ≥ 1` when you're on the clock.
- **Run rate:** estimate copies burned per pick for a player from recent draft
  flow (see §2). A player with `remaining = 1` and high demand can vanish within
  a handful of picks; `remaining = 3` of a low-demand player is effectively safe
  for a long stretch.
- **Decision use:** copies remaining is a *multiplier on urgency*, not on value.
  Two equally-ranked players — take the one with fewer copies left first if both
  are at risk, and the one with more copies left can wait. Never *raise a
  player's rank* because copies are scarce; only raise the *urgency to act now*.

> Current snapshot note: at last data pull almost all available rookies had all
> 3 copies; only Denzel Boston (2) and Antonio Williams (2) were thinning. This
> goes stale fast — the live app must read current `remaining`.

---

## 2. Survival probability — "will he fall to my next pick?"
The core in-draft question. For a target player T and a gap of `G` picks until
your next selection, estimate **P(at least one copy of T survives all G picks)**.

### 2.1 Inputs
- `copies_left(T)` — current remaining (0–3).
- `G` — picks between now and your next pick (from §0.1, or live).
- `p_pick(T)` — probability a given upcoming pick spends on T. Estimate from:
  - **Positional demand** league-wide (from `rosters-2025.json` roster norms —
    how many of each position teams carry; LB/WR/QB high demand, see methodology
    §1). Higher demand → higher `p_pick`.
  - **Board consensus / ADP proximity** — players near the top of remaining ADP
    get picked sooner. Use `avgPick` and your own board rank.
  - **Observed run rate** — update `p_pick` live from the last ~10–15 picks
    (if 4 LBs just went, LB demand is spiking now).

### 2.2 Simple model (good enough to ship)
Treat each of the next `G` picks as an independent chance to take one copy of T:
```
# probability a single upcoming pick takes a copy of T
p = p_pick(T)                      # ~0.01–0.10 typical; calibrate to run rate
# probability T still has >=1 copy after G picks, starting from c copies
# (approx: model copies burned ~ Binomial(G, p), survives if burned < c)
P_survive = P(Binomial(G, p) < copies_left(T))
```
- `copies_left = 3` is very forgiving over short gaps; `= 1` is fragile.
- **Calibrate `p` to reality, not theory.** Across 68 teams the same elite
  player often goes 3× within the first ~20 picks of a round; a mid-tier guy may
  linger rounds. The live run rate is the best estimator — weight it heavily.

### 2.3 Decision rule (take now vs wait)
For your current pick, with best-available BA and target T you'd prefer to get
*later*:
- If `P_survive(T, G) ≥ ~0.75` → you can take BA now and reasonably expect T at
  your next pick. **Wait.**
- If `P_survive(T, G) ≤ ~0.40` → T likely gone. If T > BA on your board by more
  than a tier, **take T now.**
- In between → tie-break by positional scarcity (take the steeper-VORP position
  now — LB/RB/QB before WR/TE before DB/DT, per methodology §1).

> The long gaps (2.03→2.45 = 42, 3.03→3.50 = 47, 4.03→4.52 = 49) make
> `P_survive` low for any desirable player — so at 2.03, 3.03, 4.03 lean toward
> **taking the higher-value player now** rather than gambling on a fall. Before
> the 2-pick gap (2.45→2.47), the opposite: you can often double up.

---

## 3. Trade up / down valuation
In a linear 68-team, 3-copy draft, picks are the currency. To evaluate a trade
you need a **pick-value curve**, then compare what you give vs get, adjusted for
*your* board and roster needs.

### 3.1 Build a pick-value curve
Public charts assume snake/12-team; **do not use them directly** for a 68-team
linear draft. Derive your own from your board:
```
pick_value(overall_n) ≈ board_score of the player you realistically expect at
                         overall pick n   (i.e. the value actually available there)
```
Practically: map each overall pick to the `score` (from the ranking model) of
the player your survival model expects to be on the board at that slot. This
makes pick value **endogenous to this draft's actual talent distribution** —
e.g., if there's a cliff after the top ~13, picks just before the cliff are
worth far more than picks just after, regardless of nominal round.

> Note the 3-copy effect: because each player has 3 copies, talent persists
> deeper than in a 1-copy draft — the value curve is *flatter* than a normal
> rookie draft. That structurally **reduces the payoff of trading up** and makes
> **trading down / accumulating picks** relatively more attractive. Flag this.

### 3.2 Trade-UP logic (give future/multiple picks to move up)
Justified only when **all** of:
1. A specific target T sits **above a tier cliff** on your board (real value gap,
   not a flat stretch), AND
2. `P_survive(T)` to your next natural pick is **low** (he won't fall), AND
3. The **cost in pick-value** (what you give) is **less than** the value gap you
   capture by securing T vs your next-pick fallback.
- Because copies = 3 and the curve is flat (§3.1 note), trading up is usually
  *bad* here unless T is genuinely elite-and-scarce (e.g. last viable copy of a
  Tier-1 LB/RB or a scarce QB asset, per methodology §1).

### 3.3 Trade-DOWN logic (move back, collect picks)
Favored by this league's structure. Justified when:
1. The board is in a **flat stretch** (several similar-value players, no cliff) —
   then moving back a few slots costs little board value, AND
2. Multiple players you'd be happy with have **high `P_survive`** to the lower
   slot (you'll still get one), AND
3. You receive pick-value **surplus** (extra picks / better future capital) for
   the small value you concede.
- The deep, flat, 3-copy talent distribution means flat stretches are common →
  trading down to hoard picks is often the +EV play, especially since dynasty
  rewards depth on a 90-man roster.

### 3.4 Valuation formula (apply to any proposed trade)
```
give_value = Σ pick_value(picks you send) + player_value(players you send)
get_value  = Σ pick_value(picks you get)  + player_value(players you get)
            + need_adjustment   # + if it fills a scarce-position hole (LB/RB/QB),
                                #   − if it doubles up a deep/streamable spot (CB/S/DT)
accept if get_value − give_value > 0  (with a margin for transaction risk)
```
- `player_value` = the ranking model `score` (§ methodology).
- `need_adjustment` ties trades back to **positional leverage**: acquiring an LB
  is worth more than its raw score if your LB room is thin, because LB is the
  steepest-cliff position; acquiring a CB/S/DT is worth *less* than raw score
  because you can refill those off waivers.

---

## 4. Roster-construction overlay (so picks serve a plan)
Decisions above should be filtered through what your roster needs, weighted by
positional leverage (methodology §1):
- **Prioritize accumulating** the steep-cliff positions you can't replace later:
  **LB, RB, QB** (QB only to secure the scarce asset, not to stack — 1-QB).
- **De-prioritize / stream** the flat-cliff positions: **CB, S, DT** — take only
  at steep value or as late dart-throws; don't spend top picks or trade up.
- **WR/TE** are middle — solid value, but the pool is deeper, so let them come to
  you rather than reaching.
- On a **90-man dynasty roster**, depth and youth matter → another reason to
  favor **trading down for picks** and taking upside swings late (manager has
  stated tolerance for boom/bust).

---

## 5. What the live app needs to compute this
1. **Live draft state** — current `remaining` per player, picks made, who's on
   the clock (MFL `draftResults` / live feed). Static snapshots go stale fast.
2. **Run-rate tracker** — rolling positional pick rate over the last ~10–15 picks
   to update `p_pick` dynamically.
3. **The ranking `score`** per player (from the methodology model) as the value
   backbone.
4. **The manager's remaining picks** (§0.1) to compute `G` for each decision.
5. **Roster state** for `need_adjustment`.

Outputs to surface on the clock:
- Best-available by board, annotated with `P_survive to next pick`.
- A "take now vs wait" call per top target (§2.3).
- For any trade offer: `give/get` valuation (§3.4) with a recommend/decline.

---

## 6. Limitations / cautions
- `p_pick` is the soft spot — it's an estimate of *other managers' behavior*.
  Calibrate it to live run rate; a static prior will misfire when a position runs.
- The pick-value curve is **draft-specific and board-specific** — recompute it
  as the board thins; do not import an external chart.
- Trade valuations assume your board `score` is correct; it carries all the
  caveats from `RANKING-METHODOLOGY.md` §5 (pre-snap projections, judgment
  weights). Treat trade recommendations as decision support, not autopilot —
  especially anything involving sending away future picks.
- All of this is advisory. The manager (or the picking agent) makes the call;
  surface the reasoning, don't hide it behind a single number.
