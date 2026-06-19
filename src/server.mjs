// server.mjs — the copilot web app. Serves the phone UI + a live JSON API.
//   GET  /api/board  -> live decision board (state + candidates + take/wait calls)
//   POST /api/pick   -> draft a player (DRY_RUN-gated; triple-guarded write)
//   GET  /           -> the phone page
import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { cfg } from "./config.mjs";
import { login, exp, imp, arr, submitPick } from "./mfl.mjs";
import { parseState } from "./state.mjs";
import { buildBoard, buildHistory } from "./board.mjs";
import { withAvailability, copiesTaken } from "./candidates.mjs";
import { shouldAutoPick } from "./decision.mjs";

const here = (p) => new URL(p, import.meta.url);
const rankedBoard = JSON.parse(await readFile(here("../data/rookie_board_final.json")));
const dict = JSON.parse(await readFile(here("../data/players.json")));
const posOf = new Map(arr(dict.players.player).map((p) => [p.id, p.position]));
const nameById = new Map(arr(dict.players.player).map((p) => [p.id, p.name]));

// Positional demand prior (DRAFT-DECISION-LOGIC.md §1): LB/QB/RB steep, DB/DT flat.
const prior = { LB: 0.1, QB: 0.08, RB: 0.08, WR: 0.06, TE: 0.05, DE: 0.05, DT: 0.03, S: 0.03, CB: 0.03 };
const boardOpts = (count) => ({ myFranchiseId: cfg.franchiseId, count, prior, window: 15 });

await login();

// Resolve franchise ids -> team names (one read at startup; names are stable).
const league = (await exp("league")).league;
const teamById = new Map(arr(league.franchises.franchise).map((f) => [f.id, f.name]));
const teamName = (id) => teamById.get(id) ?? `Franchise ${id}`;
const myTeam = teamName(cfg.franchiseId);
// Pick clock length, e.g. draftLimitHours "6:00" -> 21600s. MFL doesn't broadcast
// a deadline, so we derive it: deadline = last-pick timestamp + this limit.
const clockSeconds = (() => {
  const [h = 0, m = 0] = String(league.draftLimitHours || "").split(":").map(Number);
  return h * 3600 + m * 60;
})();

// The owner's curated My Draft List drives auto-pick (roster-aware), not the raw
// global board. Cache it; refresh when we're about to act.
let draftListIds = [];
async function refreshDraftList() {
  try { draftListIds = arr((await exp("myDraftList")).myDraftList?.player).map((p) => p.id); }
  catch { /* keep last known list */ }
}
await refreshDraftList();
// First My-Draft-List player still available (copies remaining), or null.
function firstFromList(state) {
  const taken = copiesTaken(state);
  for (const id of draftListIds) {
    if (3 - (taken[id] ?? 0) >= 1) return { id, name: nameById.get(id) ?? id };
  }
  return null;
}

const app = Fastify({ logger: false });

app.get("/api/board", async () => {
  const dr = await exp("draftResults");
  const b = buildBoard(dr, rankedBoard, posOf, boardOpts(cfg.candidateCount));
  if (b.onTheClock) b.onTheClock.franchiseName = teamName(b.onTheClock.franchise);
  // Derived pick clock (epoch-seconds deadline); client ticks it down, no extra polls.
  if (b.onTheClock && b.lastPickAt && clockSeconds) {
    b.clock = { deadline: b.lastPickAt + clockSeconds, limitSeconds: clockSeconds };
  }
  // Auto-pick countdown info (UI shows it on my clock). armed = will actually fire.
  if (b.onTheClock?.isMe && b.lastPickAt && b.candidates.length) {
    const target = firstFromList(parseState(dr, cfg.franchiseId)) ?? b.candidates[0];
    b.autopick = {
      deadline: b.lastPickAt + cfg.autoPickGraceSeconds,
      player: { id: target.id, name: target.name },
      armed: cfg.autoPick && !cfg.dryRun,
    };
  }
  return { ...b, myTeam, dryRun: cfg.dryRun };
});

app.get("/api/history", async () => {
  const dr = await exp("draftResults");
  const picks = buildHistory(dr, cfg.franchiseId, {
    teamOf: teamName,
    nameOf: (id) => nameById.get(id),
    posOf: (id) => posOf.get(id),
  });
  return { picks, myTeam };
});

app.get("/api/rankings", async () => {
  const dr = await exp("draftResults");
  const state = parseState(dr, cfg.franchiseId);
  const players = withAvailability(rankedBoard, state).sort((a, b) => a.rank - b.rank);
  return { players, picksMade: state.picksMade, totalPicks: state.totalPicks };
});

// Auto-pick fallback: MFL natively drafts the top available player from the owner's
// My Draft List when the clock expires. We read/sync that list (verified write).
app.get("/api/autopick", async () => {
  const cur = await exp("myDraftList");
  const list = arr(cur.myDraftList?.player)
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((p) => ({ id: p.id, name: nameById.get(p.id) ?? p.id, pos: posOf.get(p.id) ?? "?" }));
  return { list };
});

app.post("/api/autopick/sync", async () => {
  const dr = await exp("draftResults");
  const state = parseState(dr, cfg.franchiseId);
  const top = withAvailability(rankedBoard, state)
    .filter((b) => b.remaining >= 1)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 12);
  // Reversible preference list (not a draft) — safe even under DRY_RUN; it IS the fallback.
  await imp("myDraftList", { PLAYERS: top.map((b) => b.id).join(",") });
  return { synced: top.map((b) => ({ id: b.id, name: b.name, pos: b.pos })) };
});

app.post("/api/pick", async (req, reply) => {
  const playerId = req.body?.playerId;
  if (!playerId) return reply.code(400).send({ error: "playerId required" });

  // Guard 1 (idempotency): re-read live state immediately before any write.
  const dr = await exp("draftResults");
  const state = parseState(dr, cfg.franchiseId);
  const clock = state.onTheClock;
  if (!clock || !clock.isMe) return reply.code(409).send({ error: "not on the clock" });

  // Guard 2: confirm the player still has a copy available.
  const board = buildBoard(dr, rankedBoard, posOf, boardOpts(999));
  const cand = board.candidates.find((c) => c.id === playerId);
  if (!cand) return reply.code(409).send({ error: "player no longer available" });

  const where = { round: clock.round, pick: clock.pick };
  // Guard 3 (DRY_RUN): preview the exact write instead of submitting.
  if (cfg.dryRun) {
    return { dryRun: true, would: { id: playerId, name: cand.name, ...where } };
  }
  // Live: MFL itself rejects this unless ROUND/PICK match the current clock.
  const result = await submitPick({ player: playerId, round: clock.round, pick: clock.pick });
  return { drafted: { id: playerId, name: cand.name, ...where }, result };
});

app.get("/", async (_req, reply) => {
  reply.type("text/html").send(await readFile(here("../public/index.html"), "utf8"));
});

// Server-side auto-pick watcher: polls independently so it works even when no
// phone is open. Only runs when AUTO_PICK is on; DRY_RUN keeps it to logging.
const autoHandled = new Set(); // slots already handled (idempotency)
async function autoPickTick() {
  let slot;
  try {
    const dr = await exp("draftResults");
    const state = parseState(dr, cfg.franchiseId);
    const b = buildBoard(dr, rankedBoard, posOf, boardOpts(cfg.candidateCount));
    const due = shouldAutoPick(b, { graceSeconds: cfg.autoPickGraceSeconds, now: Math.floor(Date.now() / 1000) });
    if (!due) return; // not my clock, or still within the 15-min grace
    await refreshDraftList();
    const target = firstFromList(state) ?? due; // prefer the curated list; fall back to board top
    slot = `${b.onTheClock.round}.${b.onTheClock.pick}`;
    if (autoHandled.has(slot)) return;
    if (cfg.dryRun) {
      autoHandled.add(slot);
      console.log(`[autopick] DRY_RUN — would draft ${target.name} at ${slot}`);
      return;
    }
    autoHandled.add(slot); // claim before the write (no double-submit)
    const res = await submitPick({ player: target.id, round: b.onTheClock.round, pick: b.onTheClock.pick });
    console.log(`[autopick] DRAFTED ${target.name} at ${slot}: ${res.response || "OK"}`);
  } catch (e) {
    if (slot) autoHandled.delete(slot); // retry next tick on failure
    console.log("[autopick] error:", e.message);
  }
}
if (cfg.autoPick) {
  setInterval(autoPickTick, 30_000);
  console.log(`auto-pick watcher ON (grace ${cfg.autoPickGraceSeconds}s, dryRun=${cfg.dryRun})`);
}

await app.listen({ port: cfg.port, host: "0.0.0.0" });
console.log(`mfl-copilot web app -> http://localhost:${cfg.port}  (DRY_RUN=${cfg.dryRun})`);
