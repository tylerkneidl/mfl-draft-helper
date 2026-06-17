import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseState } from "./state.mjs";

const draftResults = JSON.parse(
  await readFile(new URL("../data/draftResults.json", import.meta.url)),
);

// --- real fixture: anchors against MFL schema drift ---

test("parses totals and progress from the live fixture", () => {
  const s = parseState(draftResults, "0042");
  assert.equal(s.draftType, "SAME");
  assert.equal(s.totalPicks, 272);
  assert.equal(s.picksMade, 32);
  assert.equal(s.complete, false);
});

test("onTheClock is the first unmade slot, with isMe", () => {
  const s = parseState(draftResults, "0042");
  assert.deepEqual(s.onTheClock, {
    overall: 33,
    round: "01",
    pick: "33",
    franchise: "0018",
    isMe: false,
  });
});

test("reads post-trade ownership directly off the slot", () => {
  const s = parseState(draftResults, "0042");
  const p3 = s.picks.find((p) => p.round === "01" && p.pick === "03");
  assert.equal(p3.franchise, "0068"); // traded from us (0042)
});

test("franchise 0042 has an empty roster and nine upcoming slots", () => {
  const s = parseState(draftResults, "0042");
  assert.deepEqual(s.myRoster, []);
  assert.equal(s.myUpcomingPicks.length, 9);
  assert.equal(s.myUpcomingPicks[0].round, "01");
  assert.equal(s.myUpcomingPicks[0].pick, "45");
});

test("myRoster lists a franchise's drafted ids in pick order", () => {
  const s = parseState(draftResults, "0002");
  assert.deepEqual(s.myRoster, ["17498", "17473", "17557"]);
});

// --- synthetic fixtures: logic branches the snapshot can't show ---

const synth = (picks, draftType = "SAME") => ({
  draftResults: { draftUnit: { unit: "LEAGUE", draftType, draftPick: picks } },
});

test("isMe is true when the next unmade slot is mine", () => {
  const fx = synth([
    { round: "01", pick: "01", franchise: "0001", player: "100", timestamp: "1" },
    { round: "01", pick: "02", franchise: "0007", player: "", timestamp: "" },
  ]);
  const s = parseState(fx, "0007");
  assert.equal(s.onTheClock.isMe, true);
  assert.equal(s.onTheClock.franchise, "0007");
});

test("a fully drafted board has no clock and is complete", () => {
  const fx = synth([
    { round: "01", pick: "01", franchise: "0001", player: "100", timestamp: "1" },
    { round: "01", pick: "02", franchise: "0007", player: "200", timestamp: "2" },
  ]);
  const s = parseState(fx, "0007");
  assert.equal(s.complete, true);
  assert.equal(s.onTheClock, null);
});

test("normalizes empty player and timestamp to null", () => {
  const fx = synth([
    { round: "01", pick: "01", franchise: "0001", player: "", timestamp: "" },
  ]);
  const s = parseState(fx, "0001");
  assert.equal(s.picks[0].player, null);
  assert.equal(s.picks[0].timestamp, null);
});

test("throws on a non-SAME draft type", () => {
  const fx = synth(
    [{ round: "01", pick: "01", franchise: "0001", player: "", timestamp: "" }],
    "MFL",
  );
  assert.throws(() => parseState(fx, "0001"), /SAME|draft type/i);
});

test("throws on multiple draft units", () => {
  const fx = {
    draftResults: {
      draftUnit: [
        { unit: "1", draftType: "SAME", draftPick: [] },
        { unit: "2", draftType: "SAME", draftPick: [] },
      ],
    },
  };
  assert.throws(() => parseState(fx, "0001"), /unit/i);
});
