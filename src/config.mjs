// config.mjs — all settings from env. Defaults point at your league so
// `npm run inspect` works with just MFL_USER / MFL_PASS set.
import process from "node:process";

export const cfg = {
  year: process.env.MFL_YEAR ?? "2026",
  host: process.env.MFL_HOST ?? "www45.myfantasyleague.com",
  leagueId: process.env.MFL_LEAGUE_ID ?? "41969",
  user: process.env.MFL_USER ?? null,
  pass: process.env.MFL_PASS ?? null,
  franchiseId: process.env.MFL_FRANCHISE_ID ?? null,

  slackBotToken: process.env.SLACK_BOT_TOKEN ?? null,
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET ?? null,
  slackChannel: process.env.SLACK_CHANNEL ?? null, // channel id or user DM id
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? null,

  // safety
  dryRun: (process.env.DRY_RUN ?? "true") === "true",
  autoPick: (process.env.AUTO_PICK ?? "false") === "true",
  // auto-pick fires this long after the pick becomes ours, if we haven't acted.
  autoPickGraceSeconds: Number(process.env.AUTO_PICK_GRACE_SECONDS ?? 900), // 15 min
  candidateCount: Number(process.env.CANDIDATE_COUNT ?? 6),
  port: Number(process.env.PORT ?? 3000),

  // Copilot timing. The live window is derived at runtime:
  //   window = min(maxWindowMs, leagueClock - clockSafetyMs)
  // so it can never outrun MFL's own autopick.
  maxWindowMs: 30 * 60 * 1000,
  clockSafetyMs: 90 * 1000,
  pollMs: 12 * 1000,
};

// League-specific exports/imports go to the league's host (e.g. www45...).
export const base = () => `https://${cfg.host}/${cfg.year}`;
// Site-wide exports (player dictionary, ADP/AAV, NFL schedule, injuries) MUST go
// to the central api host or MFL returns "must go to api.myfantasyleague.com".
export const apiBase = () => `https://api.myfantasyleague.com/${cfg.year}`;
