# mfl-copilot

Live draft copilot for MyFantasyLeague: alerts you on the clock, sends a curated
shortlist with reasoning to Slack, auto-picks if you don't respond in time, and
flags pending trades. Standalone — its own repo, its own Railway project.
See **SPEC.md** for the full build brief (hand it to Claude Code).

## Why a server (not an app / artifact)
MFL blocks browser/CORS calls, and the copilot must run while your phone is asleep
(polling, the 30-min timer, auto-pick). So it's a small always-on Node process.

## 0. Local check first
```bash
npm install            # no deps yet, but creates the lockfile
cp .env.example .env    # fill in MFL_USER / MFL_PASS
npm run inspect         # logs in, dumps your real league schema to ./data
```
Send me `data/league.json` + `data/draftResults.json` and I'll wire the poller,
Telegram, auto-pick, and trade analyzer to the exact fields.

## 1. Brand-new Railway project (isolated from Heat Check)
```bash
npm i -g @railway/cli
railway login
railway init           # name it "mfl-copilot" -> this is a NEW project, separate
railway up             # deploy this folder
```
Or in the dashboard: **New Project → Deploy from repo**. Railway projects are fully
isolated, so nothing touches Heat Check.

Set the env vars (dashboard → Variables, or `railway variables set KEY=value`).
Start command is `npm start`. It's a long-running worker — no public port needed.

## Cost note
You only need it running during the draft. Deploy when the draft opens, then pause
or delete the service after — keeps it to near-zero.

## Slack setup
1. Create an app at api.slack.com/apps (from scratch). Bot scope: `chat:write` → install → copy the `xoxb-` token into `SLACK_BOT_TOKEN`.
2. Enable **Interactivity** and set the Request URL to `https://<railway-domain>/slack/interactivity`.
3. Copy the **Signing Secret** into `SLACK_SIGNING_SECRET`.
4. Put the target channel/DM id in `SLACK_CHANNEL`, and turn on mobile push for it.

## Layout
```
src/config.mjs    env + auto-derived draft window
src/mfl.mjs       API client (login / export / import)
src/inspect.mjs   run first: dump league schema + pace
src/rank.mjs      ranking engine (BPA spine, fit = tiebreaker only)
src/index.mjs     copilot entry (poller/telegram/auto-pick/trades — wiring next)
```
