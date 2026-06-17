// scripts/dump-player-scores.mjs
// Dump every NFL player's fantasy score under THIS league's scoring rules:
// season total (YTD) + per-week, joined with names/pos/team from the player dict.
//   Run: node --env-file-if-exists=.env scripts/dump-player-scores.mjs [YEAR]
// Writes data/player-scores-<YEAR>.json (gitignored).
import { writeFile, readFile } from "node:fs/promises";
import { login, exp, arr } from "../src/mfl.mjs";

const YEAR = process.argv[2] ?? "2025";
// MFL's weekly playerScores export clamps W=18 to week-17 data for this league
// (its last weekly-finalized week is 17). The YTD total DOES include week 18, so
// we keep totals authoritative and emit per-week only for 1-17 to avoid a bogus
// duplicated column. (Verified: W=18 == W=17 for 100% of players.)
const WEEKS = Array.from({ length: 17 }, (_, i) => String(i + 1));

await login();

// Player dictionary -> id => {name, position, team}
const dict = JSON.parse(await readFile(new URL("../data/players.json", import.meta.url)));
const byId = new Map(arr((dict.players ?? dict).player).map((p) => [p.id, p]));

// RULES=1 applies THIS league's scoring; W is a week number or "YTD" for totals.
const fetchScores = async (W) => {
  const ps = await exp("playerScores", { YEAR, W, RULES: "1" });
  return arr((ps.playerScores ?? ps).playerScore);
};

const players = new Map(); // id -> record
const record = (id) => {
  let rec = players.get(id);
  if (!rec) {
    const meta = byId.get(id) ?? {};
    rec = { id, name: meta.name ?? null, pos: meta.position ?? null, team: meta.team ?? null, total: 0, weeks: {} };
    players.set(id, rec);
  }
  return rec;
};

// Season totals
const totals = await fetchScores("YTD");
for (const r of totals) record(r.id).total = Number(r.score);
console.log(`YTD totals: ${totals.length} players`);

// Per-week
for (const W of WEEKS) {
  const rows = await fetchScores(W);
  for (const r of rows) record(r.id).weeks[W] = Number(r.score);
  console.log(`  week ${W}: ${rows.length} scores`);
}

const out = {
  year: YEAR,
  league: "41969",
  scoringRulesApplied: true,
  weeks: WEEKS,
  note:
    "Fantasy points under league 41969 scoring. `total` = authoritative season YTD " +
    "(includes week 18). `weeks` = per-week scores for weeks 1-17 only; MFL's weekly " +
    "export clamps W=18 to week-17 data, so week 18 is omitted from the per-week map. " +
    "Therefore `total` can exceed the sum of `weeks` by a player's real week-18 score. " +
    "A missing week key means the player did not record a score that week (bye/DNP).",
  players: [...players.values()].sort((a, b) => b.total - a.total),
};
const path = new URL(`../data/player-scores-${YEAR}.json`, import.meta.url);
await writeFile(path, JSON.stringify(out, null, 2));
console.log(`\nWrote data/player-scores-${YEAR}.json — ${out.players.length} players`);
