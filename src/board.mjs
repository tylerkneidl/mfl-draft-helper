// board.mjs — pure orchestration: compose state + candidates + decision into one
// payload the web app (or any delivery layer) can render. No network, no I/O.
import { parseState } from "./state.mjs";
import { buildCandidates } from "./candidates.mjs";
import { evaluate, gapAfter, picksUntilMine, tradeSignal } from "./decision.mjs";

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
  // Trade hints only make sense while planning (waiting), not mid-pick.
  const trade = onClock ? null : tradeSignal(evaluated);
  // The current pick's clock started when the previous pick was submitted, so the
  // most recent made-pick timestamp anchors the deadline (server adds the limit).
  const ts = state.picks.filter((p) => p.player && p.timestamp != null).map((p) => p.timestamp);
  const lastPickAt = ts.length ? Math.max(...ts) : null;
  return {
    mode: onClock ? "onclock" : "peek",
    trade,
    lastPickAt,
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

// Made picks, newest-first, with team/player names resolved via injected lookups.
// Each pick's `secs` = time it took (its timestamp minus the prior pick's), and
// `slow` flags a "clock terrorist" (over slowSeconds, default 3h).
export function buildHistory(draftResults, myFranchiseId, lookups = {}, opts = {}) {
  const { teamOf = () => null, nameOf = () => null, posOf = () => null } = lookups;
  const { slowSeconds = 10800 } = opts;
  const state = parseState(draftResults, myFranchiseId);
  const made = state.picks.filter((p) => p.player !== null); // sorted by overall
  return made
    .map((p, i) => {
      const prevTs = i > 0 ? made[i - 1].timestamp : null;
      const secs = p.timestamp != null && prevTs != null ? p.timestamp - prevTs : null;
      return {
        overall: p.overall,
        round: p.round,
        pick: p.pick,
        franchise: p.franchise,
        team: teamOf(p.franchise) ?? `Franchise ${p.franchise}`,
        player: p.player,
        name: nameOf(p.player) ?? p.player,
        pos: posOf(p.player) ?? "?",
        mine: p.mine,
        secs,
        slow: secs != null && secs > slowSeconds,
      };
    })
    .reverse();
}
