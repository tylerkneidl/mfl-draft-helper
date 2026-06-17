import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildBoard, buildHistory } from "./board.mjs";

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
  assert.equal(r.lastPickAt, 1781613630); // most recent made-pick timestamp -> clock anchor
  assert.equal(r.candidates.length, 5);
  assert.equal(r.candidates[0].id, "17556"); // Reese, top available
  assert.ok(r.candidates.every((c) => ["take", "wait", "lean"].includes(c.call)));
  assert.ok(r.candidates.every((c) => c.remaining >= 1));
});

test("buildHistory lists made picks newest-first with names resolved", () => {
  const fx = {
    draftResults: {
      draftUnit: {
        unit: "LEAGUE", draftType: "SAME",
        draftPick: [
          { round: "01", pick: "01", franchise: "0007", player: "100", timestamp: "1000" },
          { round: "01", pick: "02", franchise: "0042", player: "200", timestamp: "12000" }, // 11000s = >3h
          { round: "01", pick: "03", franchise: "0009", player: "", timestamp: "" }, // unmade
        ],
      },
    },
  };
  const hist = buildHistory(fx, "0042", {
    teamOf: (id) => ({ "0007": "Aces", "0042": "MetroStars", "0009": "Bolts" })[id],
    nameOf: (id) => ({ "100": "Smith, Joe", "200": "Doe, Jane" })[id],
    posOf: (id) => ({ "100": "LB", "200": "WR" })[id],
  });
  assert.equal(hist.length, 2); // unmade slot excluded
  assert.equal(hist[0].overall, 2); // newest first
  assert.equal(hist[0].name, "Doe, Jane");
  assert.equal(hist[0].team, "MetroStars");
  assert.equal(hist[0].mine, true);
  assert.equal(hist[1].overall, 1);
  assert.equal(hist[1].mine, false);
  assert.equal(hist[1].pos, "LB");
  // clock-terrorist detection: pick 2 took 11000s (>3h) -> slow; pick 1 has no prior -> not slow
  assert.equal(hist[0].secs, 11000);
  assert.equal(hist[0].slow, true);
  assert.equal(hist[1].secs, null);
  assert.equal(hist[1].slow, false);
});
