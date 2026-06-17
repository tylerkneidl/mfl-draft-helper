import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseState } from "./state.mjs";
import {
  gapAfter,
  picksUntilMine,
  binomialSurvival,
  recentRunRate,
  estimatePPick,
  takeOrWait,
  evaluate,
  tradeSignal,
} from "./decision.mjs";

const draftResults = JSON.parse(
  await readFile(new URL("../data/draftResults.json", import.meta.url)),
);

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// --- gapAfter: picks between my consecutive picks ---

test("gapAfter reads the gap to my next pick from real state", () => {
  const state = parseState(draftResults, "0042");
  // 0042 upcoming overalls: 45, 65, 71, ...  -> gaps 20, 6
  assert.equal(gapAfter(state, 0), 20);
  assert.equal(gapAfter(state, 1), 6);
});

test("gapAfter is null when there is no next pick", () => {
  const state = { myUpcomingPicks: [{ overall: 256 }] };
  assert.equal(gapAfter(state, 0), null);
});

// --- picksUntilMine: picks until I am next on the clock (the peek horizon) ---

test("picksUntilMine counts picks from the clock to my next pick", () => {
  const state = parseState(draftResults, "0042");
  // fixture: clock at overall 33, my next pick overall 45 -> 12
  assert.equal(picksUntilMine(state), 12);
});

test("picksUntilMine is 0 when I am on the clock", () => {
  const state = {
    onTheClock: { overall: 45, isMe: true },
    myUpcomingPicks: [{ overall: 45 }, { overall: 65 }],
  };
  assert.equal(picksUntilMine(state), 0);
});

// --- binomialSurvival: P(>=1 copy survives `gap` picks) ---

test("survival is 1 when more copies remain than picks can burn", () => {
  assert.equal(binomialSurvival(3, 2, 0.9), 1);
});

test("survival is 0 when no copies remain", () => {
  assert.equal(binomialSurvival(0, 5, 0.1), 0);
});

test("survival of last copy is (1-p)^gap", () => {
  approx(binomialSurvival(1, 4, 0.5), 0.0625);
});

test("survival with 2 copies over 3 picks at p=0.5 is 0.5", () => {
  approx(binomialSurvival(2, 3, 0.5), 0.5);
});

// --- takeOrWait classification ---

test("takeOrWait classifies by thresholds", () => {
  assert.equal(takeOrWait(0.8), "wait");
  assert.equal(takeOrWait(0.75), "wait");
  assert.equal(takeOrWait(0.3), "take");
  assert.equal(takeOrWait(0.4), "take");
  assert.equal(takeOrWait(0.6), "lean");
});

// --- recentRunRate: positional pick share over a window ---

test("recentRunRate computes positional shares over the last window", () => {
  const posOf = new Map([
    ["a", "LB"], ["b", "WR"], ["c", "LB"], ["d", "QB"], ["e", "LB"],
  ]);
  const state = { picks: ["a", "b", "c", "d", "e"].map((player, i) => ({ player, overall: i + 1 })) };
  const rr = recentRunRate(state, posOf, 4); // last 4: b,c,d,e
  assert.equal(rr.n, 4);
  approx(rr.byPos.LB, 0.5); // c, e
  approx(rr.byPos.QB, 0.25);
});

// --- estimatePPick: tunable heuristic (structural properties only) ---

test("estimatePPick blends live run-rate with prior and stays in [0,1]", () => {
  const hot = estimatePPick({ pos: "LB", rank: 1 }, { byPos: { LB: 0.5 } });
  const cold = estimatePPick({ pos: "LB", rank: 1 }, { byPos: { LB: 0.0 } });
  assert.ok(hot > cold); // more recent LBs taken -> higher p
  assert.ok(hot >= 0 && hot <= 1);
  assert.ok(cold >= 0 && cold <= 1);
});

// --- evaluate: glue produces a call per candidate ---

test("evaluate annotates candidates with pSurvive and a take/wait call", () => {
  const state = {
    myUpcomingPicks: [{ overall: 45 }, { overall: 65 }], // gap 20
    picks: [],
  };
  const posOf = new Map();
  const candidates = [{ rank: 1, id: "X", pos: "LB", remaining: 1 }];
  const [r] = evaluate(candidates, state, posOf, { prior: { LB: 0.5 } });
  assert.equal(r.gap, 20);
  assert.ok(r.pSurvive >= 0 && r.pSurvive <= 1);
  assert.ok(["take", "wait", "lean"].includes(r.call));
  // last copy, high positional demand, 20-pick gap -> almost surely gone -> "take"
  assert.equal(r.call, "take");
});

// --- tradeSignal: rare, cliff-gated trade suggestions ---

test("tradeSignal flags trade-UP: elite slipping with a tier cliff behind", () => {
  const cands = [
    { rank: 1, tier: 1, name: "Elite, Guy", pSurvive: 0.15 }, // won't reach me
    { rank: 2, tier: 3, name: "Mid, A", pSurvive: 0.9 },      // best survivor, 2 tiers worse
    { rank: 3, tier: 3, name: "Mid, B", pSurvive: 0.95 },
  ];
  const s = tradeSignal(cands);
  assert.equal(s.type, "up");
  assert.equal(s.player.name, "Elite, Guy");
});

test("tradeSignal stays SILENT when a comparable player will reach me", () => {
  const cands = [
    { rank: 1, tier: 1, pSurvive: 0.15 }, // one elite slipping...
    { rank: 2, tier: 1, pSurvive: 0.9 },  // ...but another elite survives -> no cliff
    { rank: 3, tier: 2, pSurvive: 0.95 },
  ];
  assert.equal(tradeSignal(cands), null);
});

test("tradeSignal flags trade-DOWN: flat low-tier survivors, nothing elite slipping", () => {
  const cands = [1, 2, 3, 4].map((r) => ({ rank: r, tier: 4, pSurvive: 0.9 }));
  const s = tradeSignal(cands);
  assert.equal(s.type, "down");
});

test("tradeSignal stays SILENT in the common case (good player will reach me)", () => {
  const cands = [
    { rank: 1, tier: 1, pSurvive: 0.92 },
    { rank: 2, tier: 1, pSurvive: 0.95 },
  ];
  assert.equal(tradeSignal(cands), null);
});

test("evaluate honors an explicit gap override (peek horizon)", () => {
  const state = {
    myUpcomingPicks: [{ overall: 45 }, { overall: 65 }], // gapAfter would be 20
    picks: [],
  };
  const candidates = [{ rank: 1, id: "X", pos: "LB", remaining: 3 }];
  // short peek gap of 2 -> can't burn 3 copies -> certain survival
  const [r] = evaluate(candidates, state, new Map(), { gap: 2, prior: { LB: 0.5 } });
  assert.equal(r.gap, 2);
  assert.equal(r.pSurvive, 1);
  assert.equal(r.call, "wait");
});
