// rank.mjs — pure ranking engine. No I/O, no deps, easy to unit test.
//
// Philosophy: VALUE (best player available) is the spine of the sort.
// Team fit (positional need) is allowed to reorder players ONLY when their
// value is within `tieThreshold` of each other — i.e. a strict tiebreaker.
// A clearly-better player can never be jumped by a needs pick.

// Turn [{id, <key>}] into id -> rank (1 = best) by ascending key.
function toRankMap(list, key) {
  const sorted = [...list].sort((a, b) => a[key] - b[key]);
  const m = new Map();
  sorted.forEach((p, i) => m.set(p.id, i + 1));
  return m;
}

export function buildRankings({
  adp,                  // [{id, avgPick}]  — market consensus (always present)
  research = new Map(), // id -> your rank (1=best). Optional, partial is fine.
  players,              // id -> {name, pos, team}
  positionNeed = {},    // pos -> weight (higher = wins ties). This is "team fit".
  weights = { adp: 0.5, research: 0.5 },
  tieThreshold = 1.5,   // value gap under which two players count as "equal"
}) {
  const adpRank = toRankMap(adp, "avgPick");

  // 1) VALUE = blended consensus rank, lower is better. This is pure BPA.
  //    Players with no research entry fall back to their ADP rank (research
  //    only influences the players it actually covers).
  const scored = adp.map(({ id }) => {
    const a = adpRank.get(id);
    const hasResearch = research.has(id);
    const r = hasResearch ? research.get(id) : a;
    const w = hasResearch ? weights : { adp: 1, research: 0 };
    const value = w.adp * a + w.research * r;
    return { id, value, ...(players[id] ?? { name: id, pos: "??", team: "" }) };
  });

  // 2) Sort by value — this alone is your "strong preference" BPA list.
  scored.sort((x, y) => x.value - y.value);

  // 3) Band near-equal players, then let positional need reorder WITHIN a band.
  const out = [];
  let i = 0;
  while (i < scored.length) {
    const bandStart = scored[i].value;
    const band = [];
    while (i < scored.length && scored[i].value - bandStart <= tieThreshold) {
      band.push(scored[i]);
      i++;
    }
    band.sort(
      (x, y) =>
        (positionNeed[y.pos] ?? 0) - (positionNeed[x.pos] ?? 0) || // need desc
        x.value - y.value // then value asc as the final, deterministic key
    );
    out.push(...band);
  }

  return out.map((p, idx) => ({ overall: idx + 1, ...p }));
}
