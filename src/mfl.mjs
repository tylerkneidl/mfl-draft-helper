// mfl.mjs — thin MFL API client. Server-side only (MFL blocks browser/CORS calls).
import { cfg, base, apiBase } from "./config.mjs";

let cookie = null;

// Site-wide export TYPEs that must hit api.myfantasyleague.com, not the league
// host. League-aware TYPEs (league, rosters, draftResults, freeAgents, rules,
// pendingTrades) stay on the league host. Confirmed live: `adp` returns
// "must go to api.myfantasyleague.com" if sent to the league host.
const SITE_WIDE = new Set([
  "players", "adp", "aav", "nflSchedule", "nflByeWeeks", "injuries",
  "playerProfile", "topAdds", "topDrops", "topOwns", "topStarters",
]);

// Auth -> sets module-level cookie. Returns it, or null if no creds (public mode).
export async function login() {
  if (!cfg.user || !cfg.pass) return null;
  const url =
    `https://api.myfantasyleague.com/${cfg.year}/login` +
    `?USERNAME=${encodeURIComponent(cfg.user)}` +
    `&PASSWORD=${encodeURIComponent(cfg.pass)}&XML=1`;
  const body = await (await fetch(url)).text();
  const m = body.match(/MFL_USER_ID="([^"]+)"/);
  if (!m) throw new Error(`MFL login failed: ${body.slice(0, 160)}`);
  cookie = m[1];
  return cookie;
}

// export = reads. Always returns parsed JSON.
export async function exp(type, args = {}) {
  const siteWide = SITE_WIDE.has(type);
  const host = siteWide ? apiBase() : base();
  // Site-wide exports aren't league-scoped, so don't send L (harmless but tidy).
  const p = new URLSearchParams({ TYPE: type, JSON: "1", ...(siteWide ? {} : { L: cfg.leagueId }), ...args });
  const res = await fetch(`${host}/export?${p}`, {
    headers: cookie ? { Cookie: `MFL_USER_ID=${cookie}` } : {},
  });
  if (!res.ok) throw new Error(`export ${type} -> HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(`export ${type} -> ${data.error}`);
  return data;
}

// Normalize an MFL import response. Imports return XML (`<status>OK</status>` or
// `<error>...</error>`) and ignore JSON=1, so we can't blindly res.json(). Pure
// so it can be unit-tested without the network. Throws on a detectable error.
export function parseImportResponse(text) {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    const data = JSON.parse(t);
    if (data?.error) throw new Error(`import error: ${data.error}`);
    return data;
  }
  const err = t.match(/<error>([\s\S]*?)<\/error>/i);
  if (err) throw new Error(`import error: ${err[1].trim()}`);
  const status = t.match(/<status>([\s\S]*?)<\/status>/i);
  if (status) return { status: status[1].trim() };
  return { raw: t };
}

// import = writes (draft picks, etc). POST. NOTE: the exact TYPE for submitting a
// pick is case-sensitive — confirm it on api_info?STATE=test before enabling auto-pick.
export async function imp(type, args = {}) {
  if (!cookie) throw new Error("import requires login()");
  const res = await fetch(`${base()}/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `MFL_USER_ID=${cookie}`,
    },
    body: new URLSearchParams({ TYPE: type, L: cfg.leagueId, JSON: "1", ...args }),
  });
  if (!res.ok) throw new Error(`import ${type} -> HTTP ${res.status}`);
  return parseImportResponse(await res.text());
}

// Submit a live draft pick. NOT an import — a dedicated /live_draft endpoint
// (CMD=DRAFT) per MFL FAQ 935. MFL rejects anything that isn't the current slot
// ("Not the current round/pick"), so this can only ever affect the live pick.
// Returns the parsed result; throws unless success === "OK".
export async function submitPick({ player, round, pick }) {
  if (!cookie) throw new Error("submitPick requires login()");
  const p = new URLSearchParams({
    L: cfg.leagueId, CMD: "DRAFT", PLAYER_PICK: player, ROUND: round, PICK: pick, JSON: "1",
  });
  const res = await fetch(`${base()}/live_draft?${p}`, {
    headers: { Cookie: `MFL_USER_ID=${cookie}` },
  });
  if (!res.ok) throw new Error(`live_draft -> HTTP ${res.status}`);
  const data = await res.json();
  if (data?.success !== "OK") throw new Error(`live_draft -> ${data?.response || "rejected"}`);
  return data;
}

// MFL quirk: a single child is returned as an object, multiple as an array.
// Wrap every list access in this or you'll get intermittent crashes.
export const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
