// inspect.mjs — RUN THIS FIRST.
// Logs in, pulls everything the copilot needs, prints highlights, and dumps the
// raw JSON to ./data so we can map fields exactly (instead of guessing schema).
import { writeFile, mkdir } from "node:fs/promises";
import { cfg } from "./config.mjs";
import { login, exp, arr } from "./mfl.mjs";

const ok = (s) => console.log(`\x1b[32m\u2713\x1b[0m ${s}`);
const dim = (s) => console.log(`\x1b[2m${s}\x1b[0m`);

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
const dump = async (name, obj) => {
  const path = new URL(`../data/${name}.json`, import.meta.url);
  await writeFile(path, JSON.stringify(obj, null, 2));
  dim(`   raw -> data/${name}.json`);
};

const authed = await login();
authed ? ok("Logged in (cookie acquired)") : dim("• No creds set \u2014 public data only");

// 1) League settings + franchises
const leagueResp = await exp("league");
await dump("league", leagueResp);
const league = leagueResp.league;
ok(`League: ${league.name}`);
dim(`   top-level league keys: ${Object.keys(league).join(", ")}`);

console.log("\nFranchises (grab your id for MFL_FRANCHISE_ID):");
for (const f of arr(league.franchises?.franchise)) {
  const mine = f.id === cfg.franchiseId ? "  \x1b[33m<-- you\x1b[0m" : "";
  console.log(`   ${f.id}  ${f.name}${mine}`);
}

// 2) Draft status + pace inference (this is what sets the auto window)
console.log("");
try {
  const drResp = await exp("draftResults");
  await dump("draftResults", drResp);
  const units = arr(drResp.draftResults?.draftUnit);
  const picks = units.flatMap((u) => arr(u.draftPick));
  const timed = picks.filter((p) => p.timestamp).map((p) => Number(p.timestamp)).sort((a, b) => a - b);
  ok(`Draft: ${units.length} unit(s), ${picks.length} pick(s) made`);
  if (timed.length >= 3) {
    const gaps = timed.slice(1).map((t, i) => t - timed[i]).sort((a, b) => a - b);
    const medMin = Math.round(gaps[Math.floor(gaps.length / 2)] / 60);
    ok(`Median pace: ~${medMin} min/pick  -> auto window = min(30, ${medMin}-1.5) min`);
  } else {
    dim("   draft not started (or too few picks) \u2014 re-run once it's live to read pace");
  }
} catch (e) {
  dim(`• draftResults unavailable yet (${e.message})`);
}

// 3) Sanity-check public ADP fetch works
try {
  const adp = await exp("adp", { FCOUNT: String(arr(league.franchises?.franchise).length || 12) });
  ok(`ADP feed OK (${arr(adp.adp?.player).length} players)`);
} catch (e) {
  dim(`• ADP fetch failed (${e.message})`);
}

console.log("\nNext: paste me the data/league.json + data/draftResults.json shapes and I'll wire the poller + Telegram to the real fields.");
