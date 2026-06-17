// candidates.mjs — turn the ranked board + live draft state into an available
// shortlist. The board (data/rookie_board_final.json) is the VALUE layer (already
// ranked for this league); here we apply the AVAILABILITY layer and take top-N.
// See docs/RANKING-METHODOLOGY.md (value) and docs/DRAFT-DECISION-LOGIC.md (action).

// Availability = copies remaining, NOT drafted/undrafted: with rostersPerPlayer=3
// a player is gone only when all 3 copies are taken. We recompute `remaining` from
// LIVE state and overwrite the board's frozen snapshot value (which goes stale).
// Copies taken per player id from the made picks in live state.
export function copiesTaken(state) {
  const taken = {};
  for (const p of state.picks) {
    if (p.player) taken[p.player] = (taken[p.player] ?? 0) + 1;
  }
  return taken;
}

// Annotate every board entry with live `remaining` (incl. fully-gone = 0). Used
// for the full-rankings view, which shows what's gone rather than hiding it.
export function withAvailability(board, state, copies = 3) {
  const taken = copiesTaken(state);
  return board.map((b) => ({ ...b, remaining: copies - (taken[b.id] ?? 0) }));
}

// Available top-N shortlist: drop fully-gone, sort by board rank, take N.
export function buildCandidates(board, state, { count = 6, copies = 3 } = {}) {
  return withAvailability(board, state, copies)
    .filter((b) => b.remaining >= 1)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, count);
}
