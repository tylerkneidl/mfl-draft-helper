// state.mjs — parse MFL `draftResults` into live draft state. Pure, no network.
// Positions/names are NOT attached here; candidates.mjs (M2) enriches IDs from the
// player dict. See docs/plans/2026-06-16-m1-state-design.md.
import { arr } from "./mfl.mjs";

// draftResults -> { draftType, totalPicks, picks, picksMade, onTheClock,
//                   myRoster, myUpcomingPicks, complete }
export function parseState(draftResults, myFranchiseId) {
  const units = arr(draftResults?.draftResults?.draftUnit);
  // Fail loud: violated assumptions are more dangerous than a crash mid-draft.
  if (units.length !== 1) {
    throw new Error(`state: expected exactly 1 draft unit, got ${units.length}`);
  }
  const unit = units[0];
  if (unit.draftType !== "SAME") {
    throw new Error(
      `state: unsupported draftType "${unit.draftType}" — only SAME (linear) is handled`,
    );
  }

  // Sort defensively by (round, pick); never trust array order. The slot's
  // `franchise` is the current owner *including trades* (made and future slots).
  const picks = arr(unit.draftPick)
    .slice()
    .sort((a, b) => Number(a.round) - Number(b.round) || Number(a.pick) - Number(b.pick))
    .map((p, i) => ({
      overall: i + 1,
      round: p.round,
      pick: p.pick,
      franchise: p.franchise,
      player: p.player == null || p.player === "" ? null : p.player,
      timestamp: p.timestamp == null || p.timestamp === "" ? null : Number(p.timestamp),
      mine: p.franchise === myFranchiseId,
    }));

  const made = picks.filter((p) => p.player !== null);
  const onClock = picks.find((p) => p.player === null) ?? null;

  return {
    draftType: unit.draftType,
    totalPicks: picks.length,
    picks,
    picksMade: made.length,
    onTheClock: onClock && {
      overall: onClock.overall,
      round: onClock.round,
      pick: onClock.pick,
      franchise: onClock.franchise,
      isMe: onClock.franchise === myFranchiseId,
    },
    myRoster: made.filter((p) => p.mine).map((p) => p.player),
    myUpcomingPicks: picks
      .filter((p) => p.mine && p.player === null)
      .map((p) => ({ overall: p.overall, round: p.round, pick: p.pick })),
    complete: onClock === null,
  };
}
