# Ranking Brief — MFL League 41969 (2026 Rookie Draft)

> Handoff for a player-ranking agent. Everything below was pulled live from the
> MFL API on 2026-06-16 and saved to `data/*.json`. Your job: produce a ranked
> board of the **2026 rookie pool** tuned to *this league's* scoring and roster
> rules. The output plugs into `src/rank.mjs` as the `research` map.

## 1. League identity & format
- **League:** "MLS Dynasty League" (id `41969`). The MLS team names are pure
  flavor — this is an **NFL IDP dynasty** league.
- **This draft:** 2026 **Rookie** draft (`draftPlayerPool: Rookie`), **4 rounds**,
  **68 franchises**, **272 total slots**. `draftType: SAME` → **linear order**
  (same order every round, *not* snake). Email draft, **6-hour pick clock**.
- **You are franchise `0042` — NY/NJ MetroStars** (owner Tyler Kneidl).
- **⚠️ 3 copies of every player** (`rostersPerPlayer: 3`). The same player can be
  drafted by up to 3 different franchises. Availability = *copies remaining*, not
  drafted/undrafted. (Already reflected in `data/available_rookies.json`.)

## 2. Roster & starters (why IDP dominates)
Roster size **90** (deep dynasty). No positional max limits (`rosterLimits` all 0-0).
**Starting lineup = 18, of which 10 MUST be IDP** (`idp_starters: 10`):

| Slot group | Starts |
|---|---|
| QB | 1 |
| RB | 1–4 |
| WR | 2–5 |
| TE | 1–4 |
| **DT + DE** | **2–6** |
| **LB** | **2–6** |
| **CB + S** | **2–5** |

> **Takeaway: more than half your starters are defenders.** IDP rookies (LB, DT,
> DE, S, CB) are first-class assets here, not afterthoughts. Rank them alongside
> offense, not in a separate bucket.

## 3. Scoring system (the part that changes rankings)
Full rules in `data/rules.json`. Decoded highlights (`*N` = points per unit):

**Offense**
- Passing: TD **6**, yards **0.04/yd** (1 per 25), INT **−2**, 2pt **2**
- Rushing: TD **6**, yards **0.1/yd** (1 per 10), **rush attempt 0.25 each**, 2pt 2
- Receiving: TD **6**, **reception 1.0 (full PPR)**, yards **0.1/yd**
- **TE premium:** TE reception **1.5** and rec yards **0.125/yd** (TEs score more
  per catch than WR/RB — bump pass-catching TEs)
- Fumble lost **−2**

**IDP — tackle-heavy, and weighted by position.** Solo tackle / assist / sack / TFL:

| Pos | Solo TK | Assist | Sack | TFL | Pass Def |
|---|---|---|---|---|---|
| DT | **3.5** | 1.75 | 3 | 3 | 2 |
| DE | **3.0** | 1.5 | 3 | 2 | 2 |
| S  | 2.25 | 1.25 | 3 | 2 | 2 |
| CB | 2.5 | 1.25 | 3 | 2 | **3** |
| LB | 2.0 | 1.0 | 3 | 2 | 2 |

Big-play bonuses (all positions): INT/Fum-rec/Forced-fum/Def-TD/Safety ≈ **6** each.

> **Takeaway:** This rewards **volume tacklers**. Interior/edge linemen (DT 3.5,
> DE 3.0 per solo) and three-down LBs who rack up tackles are gold. Cover
> corners get a PD premium (3). Favor projected-snap-count + tackle-volume IDPs
> over boom/bust pass-rush-only types.

## 4. Where the draft stands (as of pull)
- **32 of 272 slots filled** (≈ 12 unique players × up to 3 copies; 10 players
  fully gone).
- **On the clock:** R1 P33 (Phoenix Rising FC).
- **Your first pick:** **R1 P45** — ~12 picks away when pulled.
- **All your upcoming picks (9 total, many acquired via trade):**
  `R1P45, R1P65, R2P03, R2P45, R2P47, R3P03, R3P50, R4P03, R4P52`
- **Already drafted (fully or partially):** top of board — Jeremiyah Love (RB),
  Carnell Tate (WR), Jordyn Tyson (WR), etc. See `data/draftResults.json`.

## 5. The rookie pool (what to rank)
275 total 2026 rookies; **265 still have ≥1 copy available.** By position:

`QB 15 · RB 34 · WR 59 · TE 27 · DE 26 · DT 29 · LB 30 · CB 27 · S 20 · PK/PN 6`

Market ADP (rookie, full PPR-ish consensus) is in `data/adp.json` and already
joined onto the board below.

## 6. Data artifacts (in `data/`, gitignored)
| File | Contents |
|---|---|
| `available_rookies.json` | **Start here.** 265 available rookies: `{id, name, pos, nfl, adpRank, avgPick, taken, remaining}`, sorted by ADP. |
| `players.json` | Full MFL player dictionary (2,578) w/ college, NFL team, draft capital. |
| `adp.json` | Rookie ADP feed (127 ranked). |
| `rules.json` | Full scoring rules. |
| `league.json` / `draftResults.json` | Raw league settings & live draft state. |

## 7. What to produce
A ranked board of the available rookies, **re-weighted for this league** (heavy
IDP, full PPR, TE-premium, rush-attempt points). Recommended output format —
one row per player so it can feed `src/rank.mjs` as the `research` map
(`id → rank`, 1 = best):

```json
[
  { "id": "17472", "name": "...", "pos": "RB", "rank": 1, "tier": 1, "why": "one line" }
]
```

Guidance for the ranking agent:
- Use ADP as the market prior, then **adjust for league fit**: boost high-volume
  IDP tacklers (esp. DT/DE/LB), full-PPR pass-catchers, pass-catching TEs, and
  high-carry RBs (rush attempts score).
- It's a **dynasty rookie** draft → weight long-term/landing-spot/draft-capital,
  not just Year-1 output.
- Output `id` must match the MFL ids in `available_rookies.json` so it joins back.
```
