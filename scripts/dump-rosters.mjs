// scripts/dump-rosters.mjs
// Dump every franchise's end-of-season roster for a given year, enriched with
// player names/positions/teams. Emits structured JSON + a readable markdown view.
//   Run: node --env-file-if-exists=.env scripts/dump-rosters.mjs [YEAR]
// Writes data/rosters-<YEAR>.json and data/rosters-<YEAR>.md (both gitignored).
import { writeFile, readFile } from "node:fs/promises";

const YEAR = process.argv[2] ?? "2025";
process.env.MFL_YEAR = YEAR; // must be set BEFORE config.mjs reads env on import
const { login, exp, arr } = await import("../src/mfl.mjs");
const { cfg } = await import("../src/config.mjs");

await login();

// Player dictionary (IDs are stable across years) -> id => {name, pos, team}
const dict = JSON.parse(await readFile(new URL("../data/players.json", import.meta.url)));
const byId = new Map(arr((dict.players ?? dict).player).map((p) => [p.id, p]));

// Franchise names for THIS year (flavor, but accurate to the season)
const league = (await exp("league")).league;
const nameOf = new Map(arr(league.franchises.franchise).map((f) => [f.id, f.name]));

const rosters = arr((await exp("rosters")).rosters.franchise);

// Position grouping order for readable output (offense -> IDP -> team -> other)
const POS_ORDER = ["QB", "RB", "WR", "TE", "PK", "PN", "DT", "DE", "LB", "CB", "S", "TMQB", "TMRB", "TMWR", "TMTE", "TMPK", "TMPN", "TMDL", "TMLB", "TMDB", "Def"];
const posRank = (p) => { const i = POS_ORDER.indexOf(p); return i === -1 ? 99 : i; };

const out = { year: YEAR, league: cfg.leagueId, week: rosters[0]?.week ?? null, franchises: [] };

for (const fr of rosters) {
  const players = arr(fr.player).map((p) => {
    const m = byId.get(p.id) ?? {};
    return { id: p.id, name: m.name ?? `(unknown ${p.id})`, pos: m.position ?? "?", team: m.team ?? "?", status: p.status };
  }).sort((a, b) => posRank(a.pos) - posRank(b.pos) || a.name.localeCompare(b.name));
  out.franchises.push({ id: fr.id, name: nameOf.get(fr.id) ?? fr.id, count: players.length, players });
}
out.franchises.sort((a, b) => a.id.localeCompare(b.id));

// JSON
await writeFile(new URL(`../data/rosters-${YEAR}.json`, import.meta.url), JSON.stringify(out, null, 2));

// Readable markdown
const lines = [`# ${YEAR} end-of-season rosters — ${league.name} (league ${cfg.leagueId})`, ""];
for (const f of out.franchises) {
  const mine = f.id === cfg.franchiseId ? "  ⭐ (you)" : "";
  lines.push(`## ${f.id} — ${f.name}${mine}  (${f.count})`);
  let curPos = null;
  for (const p of f.players) {
    if (p.pos !== curPos) { lines.push(`**${p.pos}**`); curPos = p.pos; }
    const tag = p.status && p.status !== "ROSTER" ? `  _[${p.status}]_` : "";
    lines.push(`- ${p.name} · ${p.team}${tag}`);
  }
  lines.push("");
}
await writeFile(new URL(`../data/rosters-${YEAR}.md`, import.meta.url), lines.join("\n"));

console.log(`Wrote data/rosters-${YEAR}.json and data/rosters-${YEAR}.md — ${out.franchises.length} franchises`);
