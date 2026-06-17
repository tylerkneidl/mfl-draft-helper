// board.mjs — pure orchestration: compose state + candidates + decision into one
// payload the web app (or any delivery layer) can render. No network, no I/O.
import { parseState } from "./state.mjs";
import { buildCandidates } from "./candidates.mjs";
import { evaluate, gapAfter } from "./decision.mjs";

// draftResults + ranked board + posOf(Map id->pos) -> renderable board payload.
export function buildBoard(draftResults, rankedBoard, posOf, opts = {}) {
  const { myFranchiseId, count = 6, prior, window, copies = 3 } = opts;
  const state = parseState(draftResults, myFranchiseId);
  const candidates = buildCandidates(rankedBoard, state, { count, copies });
  const evaluated = evaluate(candidates, state, posOf, { prior, window, copies });
  return {
    onTheClock: state.onTheClock,
    picksMade: state.picksMade,
    totalPicks: state.totalPicks,
    complete: state.complete,
    myNextPick: state.myUpcomingPicks[0] ?? null,
    myUpcomingPicks: state.myUpcomingPicks,
    gap: gapAfter(state, 0),
    candidates: evaluated,
  };
}
