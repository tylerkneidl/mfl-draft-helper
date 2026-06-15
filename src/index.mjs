// index.mjs — copilot entry point (npm start / Railway).
// Skeleton for now: the poller, Telegram channel, auto-pick, and trade watcher
// get wired here once `npm run inspect` confirms the real league schema.
import { cfg } from "./config.mjs";
import { login, exp, arr } from "./mfl.mjs";

console.log(`mfl-copilot starting for league ${cfg.leagueId} (${cfg.year})`);

if (!cfg.user || !cfg.pass) {
  console.error("Set MFL_USER / MFL_PASS first. Run `npm run inspect` to verify access.");
  process.exit(1);
}

await login();
console.log("Auth OK. Poller not wired yet \u2014 run `npm run inspect` and send me the output.");

// TODO (next):
//  - poll exp('draftResults') every cfg.pollMs; detect when franchiseId is on the clock
//  - on the clock: build board (rank.mjs) -> top N -> Anthropic reasoning -> Telegram
//  - inline-button tap -> imp('<pickType>', ...);  timeout -> auto-pick top choice
//  - poll pending trades -> value both sides -> Telegram verdict
