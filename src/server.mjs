// server.mjs — the copilot web app. Serves the phone UI + a live JSON API.
//   GET  /api/board  -> live decision board (state + candidates + take/wait calls)
//   POST /api/pick   -> draft a player (DRY_RUN-gated; triple-guarded write)
//   GET  /           -> the phone page
import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import { cfg } from "./config.mjs";
import { login, exp, imp, arr } from "./mfl.mjs";
import { parseState } from "./state.mjs";
import { buildBoard, buildHistory } from "./board.mjs";
import { withAvailability } from "./candidates.mjs";

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

const app = Fastify({ logger: false });

app.get("/api/board", async () => {
  const dr = await exp("draftResults");
  const b = buildBoard(dr, rankedBoard, posOf, boardOpts(cfg.candidateCount));
  if (b.onTheClock) b.onTheClock.franchiseName = teamName(b.onTheClock.franchise);
  // Derived pick clock (epoch-seconds deadline); client ticks it down, no extra polls.
  if (b.onTheClock && b.lastPickAt && clockSeconds) {
    b.clock = { deadline: b.lastPickAt + clockSeconds, limitSeconds: clockSeconds };
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
  const result = await imp("live_draft", {
    PLAYER: playerId,
    ROUND: clock.round,
    PICK: clock.pick,
    FRANCHISE: cfg.franchiseId,
  });
  return { drafted: { id: playerId, name: cand.name, ...where }, result };
});

app.get("/", async (_req, reply) => {
  reply.type("text/html").send(await readFile(here("../public/index.html"), "utf8"));
});

await app.listen({ port: cfg.port, host: "0.0.0.0" });
console.log(`mfl-copilot web app -> http://localhost:${cfg.port}  (DRY_RUN=${cfg.dryRun})`);
