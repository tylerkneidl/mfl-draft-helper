// decision.mjs — the ACTION layer: turn an available shortlist into take-now-vs-wait
// calls. Implements DRAFT-DECISION-LOGIC.md §2. Pure, no network.
//
// The rigorous primitives (gapAfter, binomialSurvival, recentRunRate, takeOrWait)
// are exact and tested. estimatePPick is the one tunable heuristic — the doc's
// flagged "soft spot" — kept deliberately simple and isolated so it can be
// calibrated against live run-rate later without disturbing the math.

// Picks between my pick `i` and my next pick (the gap a target must survive).
// Null when I have no next pick (my last selection).
export function gapAfter(state, i = 0) {
  const up = state.myUpcomingPicks;
  if (!up || up.length < i + 2) return null;
  return up[i + 1].overall - up[i].overall;
}

// Picks between now and when I'm NEXT on the clock — the "peek ahead" horizon
// (will this player still be here when I get to pick?). 0 if I'm on the clock now.
export function picksUntilMine(state) {
  const clock = state.onTheClock;
  if (!clock) return null;
  if (clock.isMe) return 0;
  const mine = state.myUpcomingPicks?.[0];
  if (!mine) return null;
  return mine.overall - clock.overall;
}

const choose = (n, k) => {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let j = 0; j < k; j++) c = (c * (n - j)) / (j + 1);
  return c;
};

// P(at least one copy survives `gap` picks), modeling copies burned ~ Binomial(gap, p).
// Survives iff fewer than `copiesLeft` copies are burned: P(X < copiesLeft).
export function binomialSurvival(copiesLeft, gap, p) {
  if (copiesLeft <= 0) return 0;
  if (copiesLeft > gap) return 1; // can't burn that many copies in this many picks
  let sum = 0;
  for (let k = 0; k < copiesLeft; k++) {
    sum += choose(gap, k) * p ** k * (1 - p) ** (gap - k);
  }
  return sum;
}

// Positional pick share over the last `window` made picks. posOf: Map(id -> pos).
export function recentRunRate(state, posOf, window = 12) {
  const made = state.picks.filter((p) => p.player).slice(-window);
  const byPos = {};
  for (const p of made) {
    const pos = posOf.get?.(p.player) ?? posOf[p.player];
    if (pos) byPos[pos] = (byPos[pos] ?? 0) + 1;
  }
  for (const pos of Object.keys(byPos)) byPos[pos] /= made.length || 1;
  return { byPos, n: made.length };
}

// p_pick: probability a single upcoming pick burns a copy of this target.
// Blend of live positional run-rate and a cold-start prior. THE tunable knob.
export function estimatePPick(candidate, runRate, { alpha = 0.6, prior = {}, defaultPrior = 0.03 } = {}) {
  const live = runRate.byPos?.[candidate.pos] ?? 0;
  const pri = prior[candidate.pos] ?? defaultPrior;
  const p = alpha * live + (1 - alpha) * pri;
  return Math.max(0, Math.min(1, p));
}

// Map a survival probability to an action, per DRAFT-DECISION-LOGIC.md §2.3.
export function takeOrWait(pSurvive, { waitAbove = 0.75, takeBelow = 0.4 } = {}) {
  if (pSurvive >= waitAbove) return "wait";
  if (pSurvive <= takeBelow) return "take";
  return "lean";
}

// Rare, cliff-gated trade suggestion from an evaluated, rank-sorted candidate list
// (DRAFT-DECISION-LOGIC.md §3). Returns null in the common case.
//   up   = an elite (tier<=eliteTier) you like won't survive AND the best player who
//          will survive is >= cliffTiers worse (real value cliff, no comparable behind).
//   down = nothing elite is slipping AND your survivors are a flat low-tier stretch
//          (interchangeable depth) -> accumulate picks instead.
export function tradeSignal(candidates, opts = {}) {
  const { surviveCut = 0.5, eliteTier = 2, cliffTiers = 2, flatTier = 3, flatCount = 4 } = opts;
  const survivors = candidates.filter((c) => c.pSurvive >= surviveCut);
  const slipping = candidates.filter((c) => c.pSurvive < surviveCut);
  const eliteSlipping = slipping.find((c) => (c.tier ?? 99) <= eliteTier);
  const bestSurvivor = survivors[0]; // rank-sorted -> [0] is the best that reaches me

  if (eliteSlipping && bestSurvivor && bestSurvivor.tier - eliteSlipping.tier >= cliffTiers) {
    return { type: "up", player: eliteSlipping, dropToTier: bestSurvivor.tier };
  }
  if (!eliteSlipping && survivors.length >= flatCount) {
    const t = survivors[0].tier ?? 99;
    if (t >= flatTier && survivors.slice(0, flatCount).every((c) => (c.tier ?? 99) === t)) {
      return { type: "down", tier: t };
    }
  }
  return null;
}

// Annotate each candidate with gap, p_pick, pSurvive and a take/wait/lean call.
export function evaluate(candidates, state, posOf, opts = {}) {
  const { window, copies = 3, thresholds, gap: gapOpt, ...ppickOpts } = opts;
  // Caller may override the survival horizon (peek-ahead uses picksUntilMine);
  // default is the take-vs-wait gap between my consecutive picks.
  const gap = "gap" in opts ? gapOpt : gapAfter(state, 0);
  const runRate = recentRunRate(state, posOf, window);
  return candidates.map((c) => {
    const remaining = c.remaining ?? copies;
    if (gap == null) {
      return { ...c, gap: null, pPick: null, pSurvive: 0, call: "take" }; // last pick
    }
    const pPick = estimatePPick(c, runRate, ppickOpts);
    const pSurvive = binomialSurvival(remaining, gap, pPick);
    return { ...c, gap, pPick, pSurvive, call: takeOrWait(pSurvive, thresholds) };
  });
}
