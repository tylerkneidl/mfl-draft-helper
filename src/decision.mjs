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

// Annotate each candidate with gap, p_pick, pSurvive and a take/wait/lean call.
export function evaluate(candidates, state, posOf, opts = {}) {
  const { window, copies = 3, thresholds, ...ppickOpts } = opts;
  const gap = gapAfter(state, 0);
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
