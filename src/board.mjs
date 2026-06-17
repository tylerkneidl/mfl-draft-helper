// board.mjs — pure orchestration: compose state + candidates + decision into one
// payload the web app (or any delivery layer) can render. No network, no I/O.
import { parseState } from "./state.mjs";
import { buildCandidates } from "./candidates.mjs";
import { evaluate, gapAfter, picksUntilMine } from "./decision.mjs";

// draftResults + ranked board + posOf(Map id->pos) -> renderable board payload.
// Survival horizon is context-aware:
//   on the clock -> "survives to my NEXT pick" (take-vs-wait, gap = 45->65)
//   waiting       -> "survives to MY pick"      (peek ahead,    gap = now->45)
export function buildBoard(draftResults, rankedBoard, posOf, opts = {}) {
  const { myFranchiseId, count = 6, prior, window, copies = 3 } = opts;
  const state = parseState(draftResults, myFranchiseId);
  const onClock = !!state.onTheClock?.isMe;
  const untilMyPick = picksUntilMine(state);
  const untilNextPick = gapAfter(state, 0);
  const gap = onClock ? untilNextPick : untilMyPick;

  const candidates = buildCandidates(rankedBoard, state, { count, copies });
  const evaluated = evaluate(candidates, state, posOf, { prior, window, copies, gap });
  return {
    mode: onClock ? "onclock" : "peek",
    onTheClock: state.onTheClock,
    picksMade: state.picksMade,
    totalPicks: state.totalPicks,
    complete: state.complete,
    myNextPick: state.myUpcomingPicks[0] ?? null,
    myUpcomingPicks: state.myUpcomingPicks,
    picksUntilMyPick: untilMyPick,
    picksUntilNextPick: untilNextPick,
    gap,
    candidates: evaluated,
  };
}
