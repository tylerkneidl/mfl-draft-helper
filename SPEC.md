# MFL Live Draft Copilot — Build Spec

> Handoff brief for Claude Code. A Node scaffold already exists (see §4); **extend it, don't rebuild it.** Read §2 before writing any code — several constraints are non-obvious and will cause silent bugs if ignored.

## 1. Objective
An always-on service that acts as a live draft copilot for a single owner in a private MyFantasyLeague (MFL) league. It:
- watches the draft and detects when the owner is on the clock;
- sends a curated shortlist of recommended players to **Slack**, each with a one-line rationale;
- lets the owner draft by tapping a Slack button;
- auto-picks the top recommendation if there's no response within a time window derived from the league's own clock;
- auto-detects pending trades (players, draft picks, draft-slot swaps) and posts a valuation + verdict to Slack.

Single user, single franchise, personal use. Runs only during the draft window.

## 2. Non-negotiable constraints (read first)
1. **MFL is server-side only.** MFL blocks browser/CORS access. Never call MFL from client code.
2. **Param/TYPE names are case-sensitive.** Copy them exactly from the MFL reference: `api_info?STATE=details` and the per-endpoint tester `api_info?STATE=test`.
3. **MFL JSON single-vs-array quirk.** A single child element returns as an object; multiple return as an array. Always normalize with the existing `arr()` helper before iterating. This is the #1 source of intermittent crashes.
4. **Auth via cookie.** `login` returns an `MFL_USER_ID` cookie; pass it on every league-specific request. League is private, so reads/writes require it.
5. **Rate limits.** MFL monitors and throttles. Poll no faster than ~12s. Cache the player dictionary to disk (it's large and static).
6. **Auto-pick is an irreversible write.** It must stay behind guardrails (§9). `DRY_RUN=true` until the write endpoint is verified live.
7. **Don't hardcode the pick-write TYPE.** The exact import TYPE + args for submitting a pick must be confirmed on `api_info?STATE=test` first (tracked in §13). Guessing risks misfiring on a real pick.
8. **The decision window must never outrun MFL's clock.** Derive `window = clamp(min(maxWindowMs, leagueClock − clockSafetyMs), 60s, maxWindowMs)`.

## 3. Tech stack
- Node ≥ 20, ESM (`"type": "module"`).
- **Fastify** — required now because Slack interactivity needs an inbound HTTPS endpoint.
- Slack Web API (`chat.postMessage`, `chat.update`) + Block Kit buttons + interactivity. Raw `fetch` is fine; `@slack/web-api` optional.
- Anthropic API for per-player reasoning and trade rationale. Use `claude-sonnet-4-6`; keep prompts short; request strict JSON.
- Hosting: **Railway, a brand-new isolated project** (must not share anything with the owner's existing "Heat Check" project). Service exposes a public domain for Slack's request URL and runs the poller in the background.
- Keep dependencies minimal: `fastify`, optionally `@anthropic-ai/sdk`. Nothing else required.

## 4. Current scaffold — start here
Already written and syntax-checked:
- `src/config.mjs` — env config; Slack + Anthropic creds; safety flags (`dryRun`, `autoPick`); timing (`maxWindowMs`, `clockSafetyMs`, `pollMs`); `candidateCount`; `port`.
- `src/mfl.mjs` — `login()`, `exp(type, args)` (read), `imp(type, args)` (write), `arr()` (single/array normalizer).
- `src/inspect.mjs` — bootstrap: dumps `data/league.json` + `data/draftResults.json`, prints franchises and median pace. **This is M0.**
- `src/rank.mjs` — ranking engine. BPA value is the spine; positional need only reorders players *within* a tie band, never across. Pure/testable.
  - Signature: `buildRankings({ adp, research, players, positionNeed, weights, tieThreshold }) -> [{ overall, id, value, name, pos, team }]`
- `src/index.mjs` — entry stub to wire everything into.

## 5. Architecture / data flow
```
            ┌─────────── poller (every pollMs) ───────────┐
            ▼                                              │
   exp('draftResults') ─▶ state.mjs ─▶ on the clock? ──no──┘
                                          │ yes
                                          ▼
                 candidates.mjs (rank.mjs ∩ freeAgents, top N)
                                          ▼
                 reasoner.mjs (Anthropic: one line per player)
                                          ▼
                 slack.mjs  postMessage(blocks + buttons + timer)
                            │                         │
                   user taps button            window elapses
                            ▼                         ▼
                 server.mjs /slack/interactivity   picker.autoPick()
                            └────────▶ picker.submitPick() ◀───────┘
                                          ▼
                              chat.update("✅ drafted …")

   parallel:  poller ─▶ trades.mjs (pendingTrades) ─▶ value+verdict ─▶ Slack
```

## 6. Target repo structure
```
src/
  config.mjs      [exists]
  mfl.mjs         [exists] — add wrappers: freeAgents, players (disk-cached), pendingTrades, submitPick
  rank.mjs        [exists]
  inspect.mjs     [exists]
  state.mjs       draft state machine: parse draftResults -> order, picksMade, onTheClock, myRoster, complete?
  candidates.mjs  shortlist: board ∩ available, roster context, top N
  reasoner.mjs    Anthropic: batched per-pick one-liners + trade rationale (strict JSON out)
  slack.mjs       postMessage, buildBlocks, updateMessage, verifySignature
  server.mjs      Fastify: GET /healthz, POST /slack/interactivity (verify -> ack <3s -> route)
  picker.mjs      submitPick (imp), autoPick w/ guardrails, DRY_RUN
  trades.mjs      poll pendingTrades, valuePick model, evaluateTrade
  window.mjs      derive decision window from clock/pace
  index.mjs       [exists] wire: start Fastify + poller loop
test/
  rank.test.mjs  state.test.mjs  trades.test.mjs  window.test.mjs   (pure, run vs data/*.json fixtures)
data/             cached players + dumped schema (gitignored)
```

## 7. External setup
### MFL
Confirm these read TYPEs return as expected (via inspect/test console): `league`, `rosters`, `draftResults`, `freeAgents`, `adp`, `players`, `pendingTrades`. Confirm the **write** TYPE for a pick (§13).

### Slack
- Create an app at api.slack.com/apps (from scratch). Bot token scope: `chat:write` (add `chat:write.customize` if customizing name/icon). Install → copy `xoxb-` token to `SLACK_BOT_TOKEN`.
- **Enable Interactivity** → Request URL = `https://<railway-domain>/slack/interactivity`.
- Copy the **Signing Secret** to `SLACK_SIGNING_SECRET`. Verify `X-Slack-Signature` + `X-Slack-Request-Timestamp` on every inbound request (HMAC-SHA256 over `v0:{ts}:{rawBody}`); reject if timestamp skew > 5 min. **Use the raw request body for the HMAC** — register a Fastify content parser that preserves it.
- **Ack within 3 seconds**: return HTTP 200 immediately, then do the pick submission asynchronously (use the payload's `response_url` or `chat.update`).
- Target a private `#draft` channel or a DM (`SLACK_CHANNEL`). Owner turns on mobile push for that channel.

### Anthropic
- `ANTHROPIC_API_KEY`. One batched call per pick returning `[{ id, why }]`. Instruct the model to output **only** JSON; parse defensively; fall back to a template string on failure.

## 8. Core logic specs
### 8.1 state.mjs
Parse `draftResults` into picks in order. Compute full draft order from the league's draft setup + franchise list + round count. `picksMade` = completed picks; next pick → franchise on the clock; `onTheClock = (nextFranchise === cfg.franchiseId)`. Build `myRoster` (id→pos) from the owner's completed picks. Detect draft completion.
- **Edge cases:** support snake *and* linear order; pick ownership can change via traded picks, so read each pick's owning franchise from the data — never assume a static slot→franchise map.

### 8.2 candidates.mjs
`available = players − drafted`. Run `rank.mjs` over available ADP to get the board. Take top `cfg.candidateCount`. Compute roster needs = starting-lineup requirements − current `myRoster`, and pass as `positionNeed` (value still dominates via banding). Attach context for the reasoner.

### 8.3 reasoner.mjs
Input `{ round, pick, myRoster, needs, candidates:[{name,pos,team,adp,value}] }`. Output strict JSON `[{ id, why }]`, one value-first sentence each; fit mentioned only as a tiebreak. Defensive parse + template fallback.

### 8.4 window.mjs
`leagueClock` from draft settings if exposed; else median pick gap from `draftResults` timestamps; else a conservative configurable default. Apply the §2.8 clamp.

### 8.5 slack.mjs (Block Kit)
Header: `🏈 On the clock — Round R, Pick P`. One section per candidate (`name · POS · TEAM · ADP` + the `why`). Actions block: one button per candidate (`action_id="pick"`, `value=playerId`) plus a "best available" button. Context footer: `Auto-picks <top> in mm:ss`. On selection → `chat.update` to `✅ Drafted <player>`.

### 8.6 picker.mjs
`submitPick(playerId)` → `imp(PICK_TYPE, { FRANCHISE: cfg.franchiseId, PLAYER: playerId, ... })` (exact args from §13). If `cfg.dryRun`, log only. Guardrails in §9.

### 8.7 trades.mjs
Poll `pendingTrades` filtered to `cfg.franchiseId`. For each offer, enumerate assets per side (players + picks + slot swaps).
- `valueAsset(player)` = board value (rank → projected-points proxy).
- `valueAsset(pick @ round R, slot S)` = board value at that **overall** pick index (expected best-available there).
- `delta = Σ value(received) − Σ value(given)`, normalized. Verdict: favorable / fair / unfavorable + magnitude. Reasoner adds a one-liner. Post to Slack as **informational only — never auto-accept a trade.**

## 9. Auto-pick guardrails (safety-critical)
- `DRY_RUN=true` by default until the pick endpoint is verified live.
- Log the intended pick (player, round, pick) at WARN before any write.
- Kill switch: `AUTO_PICK` env and/or a Slack "disable autopick" button. If off, on timeout just re-alert — don't write.
- Idempotency: re-read `draftResults` immediately before writing to confirm still on the clock and player still available; never submit twice for the same slot.
- If the live clock is shorter than expected, shrink the window rather than risk MFL's autopick beating us.

## 10. Env vars
See `.env.example`. Summary: `MFL_*`, `MFL_FRANCHISE_ID`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_CHANNEL`, `ANTHROPIC_API_KEY`, `DRY_RUN`, `AUTO_PICK`, `CANDIDATE_COUNT`, `PORT`.

## 11. Build milestones (each independently verifiable)
- **M0 Access** — `npm run inspect` returns league + draftResults; confirm franchise id; dump schema. *(scaffold done)*
- **M1 State** — `state.mjs` parses the dumped fixture → correct `onTheClock` / `myRoster`. Unit-tested offline.
- **M2 Candidates** — top-N available board from fixture. Offline test.
- **M3 Slack outbound** — post a static shortlist to the channel (no buttons). Verify push on phone.
- **M4 Slack interactivity** — Fastify endpoint + signature verify + 3s ack; button tap logs selection under `DRY_RUN`.
- **M5 Reasoner** — Anthropic per-pick JSON wired into the message.
- **M6 Picker** — `submitPick` behind `DRY_RUN`; verify `PICK_TYPE` on test console; live-arm with guardrails.
- **M7 Auto-pick** — timer + idempotency + kill switch.
- **M8 Trades** — poll + value + Slack verdict.
- **M9 Deploy** — new Railway project; set Slack request URL to the Railway domain; end-to-end mock-draft test.

## 12. Testing
- Pure units (no network): `rank`, trade valuation, window calc, state parsing — run against saved `data/*.json` fixtures from M0.
- Integration: run in `DRY_RUN`. Strongly recommended: create a throwaway MFL **mock draft** league for live end-to-end before the real one.

## 13. Open items — verify, don't guess
1. Exact MFL **write TYPE + args** to submit a draft pick (`api_info?STATE=test`).
2. `pendingTrades` export TYPE + shape, and how **draft-slot swaps** are represented.
3. Where the **live pick clock** lives in the API (league draft settings vs. not exposed → infer from timestamps).
4. `league.json` field names for **roster/starter requirements** and **draft order / round count**.
All four are answered by the M0 dump (`data/*.json`) plus the test console.
