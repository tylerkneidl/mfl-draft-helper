import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildBoard } from "./board.mjs";

const draftResults = JSON.parse(
  await readFile(new URL("../data/draftResults.json", import.meta.url)),
);
const rookieBoard = JSON.parse(
  await readFile(new URL("../data/rookie_board_final.json", import.meta.url)),
);

test("buildBoard composes state + candidates + decision into one payload", () => {
  const r = buildBoard(draftResults, rookieBoard, new Map(), {
    myFranchiseId: "0042",
    count: 5,
  });
  assert.equal(r.totalPicks, 272);
  assert.equal(r.picksMade, 32);
  assert.equal(r.complete, false);
  assert.equal(r.onTheClock.franchise, "0018");
  assert.equal(r.onTheClock.isMe, false);
  assert.equal(r.myNextPick.round, "01");
  assert.equal(r.myNextPick.pick, "45");
  // not on the clock -> peek mode: survival horizon is "until my pick" (33 -> 45 = 12),
  // not the take-vs-wait gap between my consecutive picks (45 -> 65 = 20).
  assert.equal(r.mode, "peek");
  assert.equal(r.picksUntilMyPick, 12);
  assert.equal(r.picksUntilNextPick, 20);
  assert.equal(r.gap, 12);
  assert.equal(r.candidates.length, 5);
  assert.equal(r.candidates[0].id, "17556"); // Reese, top available
  assert.ok(r.candidates.every((c) => ["take", "wait", "lean"].includes(c.call)));
  assert.ok(r.candidates.every((c) => c.remaining >= 1));
});
