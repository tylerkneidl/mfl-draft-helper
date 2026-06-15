// mfl.mjs — thin MFL API client. Server-side only (MFL blocks browser/CORS calls).
import { cfg, base } from "./config.mjs";

let cookie = null;

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
  const p = new URLSearchParams({ TYPE: type, L: cfg.leagueId, JSON: "1", ...args });
  const res = await fetch(`${base()}/export?${p}`, {
    headers: cookie ? { Cookie: `MFL_USER_ID=${cookie}` } : {},
  });
  if (!res.ok) throw new Error(`export ${type} -> HTTP ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(`export ${type} -> ${data.error}`);
  return data;
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
  return res.json();
}

// MFL quirk: a single child is returned as an object, multiple as an array.
// Wrap every list access in this or you'll get intermittent crashes.
export const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
