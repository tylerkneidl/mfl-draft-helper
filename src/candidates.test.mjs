import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseState } from "./state.mjs";
import { buildCandidates, withAvailability } from "./candidates.mjs";

const board = JSON.parse(
  await readFile(new URL("../data/rookie_board_final.json", import.meta.url)),
);
const draftResults = JSON.parse(
  await readFile(new URL("../data/draftResults.json", import.meta.url)),
);

// --- real fixtures (32-pick snapshot) ---

test("shortlist is the top board players still available, in rank order", () => {
  const state = parseState(draftResults, "0042");
  const c = buildCandidates(board, state, { count: 6 });
  assert.equal(c.length, 6);
  assert.equal(c[0].id, "17556"); // Reese, board #1, remaining 3
  assert.deepEqual(
    c.map((p) => p.rank),
    [...c.map((p) => p.rank)].sort((a, b) => a - b),
  );
  assert.ok(c.every((p) => p.remaining >= 1));
});

test("live availability overrides the board's stale remaining", () => {
  const state = parseState(draftResults, "0042");
  const c = buildCandidates(board, state, { count: 30 });
  const boston = c.find((p) => p.id === "17500"); // 1 copy taken in fixture
  assert.equal(boston.remaining, 2);
});

// --- synthetic fixtures: logic branches ---

const stateOf = (...playerIds) => ({ picks: playerIds.map((player) => ({ player })) });

test("excludes players whose copies are all gone", () => {
  const b = [
    { rank: 1, id: "A", name: "Aye", pos: "LB" },
    { rank: 2, id: "B", name: "Bee", pos: "WR" },
  ];
  const c = buildCandidates(b, stateOf("A", "A", "A"), { count: 5 });
  assert.equal(c.length, 1);
  assert.equal(c[0].id, "B");
});

test("remaining reflects partial copies taken", () => {
  const b = [{ rank: 1, id: "A", name: "Aye", pos: "LB" }];
  const c = buildCandidates(b, stateOf("A"), { count: 5 });
  assert.equal(c[0].remaining, 2);
});

test("respects the count limit", () => {
  const b = [
    { rank: 1, id: "A" },
    { rank: 2, id: "B" },
    { rank: 3, id: "C" },
  ];
  const c = buildCandidates(b, stateOf(), { count: 2 });
  assert.equal(c.length, 2);
  assert.deepEqual(c.map((p) => p.id), ["A", "B"]);
});

test("sorts by board rank even when the board is unordered", () => {
  const b = [
    { rank: 3, id: "C" },
    { rank: 1, id: "A" },
    { rank: 2, id: "B" },
  ];
  const c = buildCandidates(b, stateOf(), { count: 3 });
  assert.deepEqual(c.map((p) => p.id), ["A", "B", "C"]);
});

test("withAvailability annotates the whole board incl. gone players", () => {
  const b = [
    { rank: 1, id: "A" },
    { rank: 2, id: "B" },
    { rank: 3, id: "C" },
  ];
  const all = withAvailability(b, stateOf("A", "A", "A", "B"));
  assert.equal(all.length, 3); // nothing filtered
  assert.equal(all.find((p) => p.id === "A").remaining, 0); // fully gone, still present
  assert.equal(all.find((p) => p.id === "B").remaining, 2);
  assert.equal(all.find((p) => p.id === "C").remaining, 3);
});
