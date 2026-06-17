# M1 — `state.mjs` draft-state parser (design)

Date: 2026-06-16
Milestone: M1 (SPEC §8.1, §11)

## Purpose

Turn a parsed `draftResults` payload into the live draft state the copilot acts on:
whose turn it is, what's been picked, which slots are ours. Pure, offline,
unit-tested against `data/*.json` fixtures. No network.

## Key reality (corrects SPEC §8.1)

The SPEC says "compute full draft order from the league's draft setup + franchise
list + round count." That is now **wrong**: each pick slot in `draftResults`
already carries its **current (post-trade) owning franchise**, on made *and*
future slots. Reconstructing order from `round1DraftOrder` would show *pre-trade*
ownership. We read `franchise` straight off each pick instead.

Confirmed against the live fixture (68 teams, 4 rounds, `draftType: SAME`, 272
slots, 32 made): slot `R01P03` is owned by `0068` (traded from us, `0042`);
franchise `0042` has made 0 picks and owns 9 upcoming slots (acquired via trades).

## API

```js
parseState(draftResults, myFranchiseId) -> {
  draftType,                 // "SAME"; asserted
  totalPicks,                // 272
  picks: [{ overall, round, pick, franchise, player|null, timestamp|null, mine }],
  picksMade,                 // count of slots with a player
  onTheClock: { overall, round, pick, franchise, isMe } | null,  // null when complete
  myRoster: [playerId, ...],          // my made picks, in pick order (IDs only)
  myUpcomingPicks: [{ overall, round, pick }, ...],
  complete: boolean,
}
```

Pure to `draftResults` — positions/names are attached later in `candidates.mjs`
(M2), which already loads `players.json`. Keeps `state.mjs` single-responsibility
and its tests free of the 1.3 MB player dict.

## Parsing logic

1. Pull the single `draftUnit` (unit "LEAGUE"); **assert `draftType === "SAME"`**.
2. `arr(draftPick)` → sort by `(round, pick)` ascending (never trust array order).
3. Normalize each slot: `player:""`→`null`, `timestamp:""`→`null`,
   `mine = franchise === myFranchiseId` (string compare; IDs are zero-padded).
   `overall` = 1-based index after sort.
4. Derive `picksMade`, `onTheClock` (first slot with `player === null`),
   `myRoster`, `myUpcomingPicks`, `complete`.

## Fail-loud edge cases

- `draftType !== "SAME"` → throw. On-the-clock logic assumes linear order; a snake
  draft would silently mis-assign. Crash beats mislead during a live draft.
- `!= 1` draft unit → throw.
- All list access via `arr()` (MFL returns single child as object, many as array).
- Out-of-order / gapped picks handled by sort + "first null in order".

## Test plan (`src/state.test.mjs`, `node --test`)

Real fixture (`data/draftResults.json`) anchors schema correctness:
- `totalPicks===272`, `picksMade===32`, `complete===false`
- `onTheClock === {overall:33, round:"01", pick:"33", franchise:"0018", isMe:false}`
- traded ownership: slot `R01P03` → `franchise:"0068"`
- `parseState(fixture,"0042")` → `myRoster===[]`, `myUpcomingPicks.length===9`, first `R01P45`
- non-empty roster path: `parseState(fixture,"0002")` → that franchise's 3 IDs in order

Synthetic mini-fixtures cover branches the snapshot can't:
- `isMe:true` (first empty slot's franchise is the "me" arg)
- `complete:true` → `onTheClock===null`, `complete===true`
- fail-loud: snake `draftType` throws; two draft units throw
- normalization: `player:""`→`null`, `timestamp:""`→`null`

Rationale: real fixture catches MFL schema drift; synthetic fixtures exercise logic
branches (notably `isMe:true`) that won't occur in real data until we're on the clock.
