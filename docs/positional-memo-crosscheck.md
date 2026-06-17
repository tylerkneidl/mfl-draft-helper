# Cross-check: league-mate's Positional Value memo vs. our ranking model

Source: `docs/Positional_Value_and_Scarcity_Memo.pdf` — a study by a league member
over **805 franchise-seasons (2019–2025)** of **OUR league's own history**
(EDSL → EFA → MLS are this league's prior names/formats, not other leagues). It
measures positional value from **actual all-play win-rate lift** of fielding a
top-quartile room, plus trade prices and replaceability — a completely different
method from our replacement-level VORP model (`RANKING-METHODOLOGY.md §1`),
applied to **the same league we're drafting for**. So this is not external
validation: it's our own league's empirical truth, and where our board disagrees
with it, the board is the thing to question.

## Headline: strong independent validation

| Pos | Memo all-play lift (rank) | Our `LEV` (rank) | Verdict |
|-----|--------------------------|------------------|---------|
| RB  | 19.8 (1) | 0.92 (2) | ✅ both top tier |
| LB  | 18.8 (2) | 1.00 (1) | ✅ both top tier |
| TE  | 14.4 (3) | 0.53 (5) | ⚠️ memo rates higher |
| WR  | 13.0 (4) | 0.62 (4) | ✅ aligned |
| S   | 10.9 (5) | 0.33 (7) | ➖ see note |
| QB  | 10.3 (6) | 0.78 (3) | ⚠️ memo cooler |
| DE  | 7.2 (7)  | 0.50 (6) | ✅ both fade vs market |
| DT  | 5.7 (8)  | 0.30 (8) | ✅ both low |
| CB  | −2.7 (9) | 0.28 (9) | ✅✅ both "do not pay" |

The agreement at the **anchors is exact**: RB/LB are the winning engines; **CB is
dead last** (the memo has it *negative* — "do not pay"; we have it lowest). DE is
flagged by both as a market overpay. DT/CB/S are churn.

## The replaceability column is the strongest confirmation

The memo's "late-draft (R3–5) 150+ hit rate" is literally our replacement-level
argument in win-rate clothing. Hard-to-replace = draft early:

- **Hard to replace late:** TE **0.0%**, WR 2.2%, LB 3.1%, DT 3.3%, DE 4.7%, RB 5.5%
- **Easy to replace late (churn):** CB 43.4%, S 28.5%, QB 8.3%

This directly endorses our "fade rookie CB/S/DT, prioritize LB/RB/WR" stance.

## Where it suggests a tweak

1. **TE — the one concrete adjustment.** The memo independently rates TE **above
   WR** in winning lift (14.4 vs 13.0), calls it "likely underpriced," and shows
   it's the **single hardest position to replace late (0.0% hit rate)**. Our model
   has `LEV['TE'] = 0.53`, *below* WR (0.62). Combined with this league's
   **TE-premium scoring (1.5/rec)**, both signals point the same way: **TE's
   multiplier is probably a touch low — consider bumping it toward/above WR.**
   This is a ranking-layer change (re-weight `LEV['TE']` and re-rank), i.e. a job
   for the ranking agent, not the app.

2. **QB — our most aggressive call, judged by our own history.** Our league's
   history rates QB *room* lift only middling (10.3) and says **"secure one QB1
   anchor; don't overpay for QB2/QB3 depth."** Our board elevated QB to
   `LEV['QB'] = 0.78` on the 3.04-QB roster scarcity (`RANKING-METHODOLOGY.md §1.3`).
   These aren't really in conflict: putting **one** QB (Ty Simpson) at #2 *is* the
   "buy one anchor" play — the memo's warning is against QB *depth*, not against a
   single early QB1. Still, the memo is our own league saying QB isn't a top
   winning engine, so **Simpson at #2 is the board's most aggressive bet** and the
   first knob to revisit (already flagged in `RANKING-METHODOLOGY.md §5`).

3. **S (safety).** Memo rates S mid-pack (10.9), we fade it (0.33). No real
   conflict: the memo *also* shows S is the second-most replaceable position
   (28.5% late hit), so for a **rookie** draft, fading rookie safeties is still
   right — you can source S production late and cheap.

## Net

The memo is an independent confirmation of the board's spine: **draft LB/RB/WR
early, never pay for CB, treat DT/S as churn, don't overpay DE.** The only
actionable divergence is **TE, which both the memo and our TE-premium scoring say
should rank a bit higher** — worth feeding back to the ranking agent. The app
itself needs no change; it consumes whatever board the ranking layer produces.
