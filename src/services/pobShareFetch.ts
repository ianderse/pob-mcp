/**
 * Fetch a Path of Building export code from a pobb.in or poedb.tw share link.
 *
 * This module only downloads the text export code. Decoding and loading go
 * through the existing import path (`lua_import_code`), so nothing downloaded
 * is written to disk and nothing is inflated here.
 */

const ALLOWED_HOSTS = new Set(["pobb.in", "poedb.tw"]);

/** Request timeout (ms). */
export const POB_SHARE_TIMEOUT_MS = 20_000;
/** Largest response body accepted (bytes). A build export code is well under this. */
export const POB_SHARE_MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT = "pob-mcp-server";
const ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

export interface PobShareTarget {
  source: "pobb.in" | "poedb.tw";
  id: string;
  /** URL serving the raw export code as text. */
  rawUrl: string;
  /** Canonical page URL, for display. */
  pageUrl: string;
}

/**
 * Parse a pobb.in or poedb.tw share link (or a bare pobb.in ID).
 *   https://pobb.in/<id>, https://pobb.in/u/<user>/<id>, <id>
 *   https://poedb.tw/<locale>/PathOfBuilding?id=<id>
 */
export function parsePobShareInput(input: string): PobShareTarget {
  const trimmed = (input ?? "").trim();
  const unsupported = () =>
    new Error(
      `Cannot parse build URL or ID from: "${trimmed.slice(0, 200)}". ` +
        `Supported: https://pobb.in/<id>, https://pobb.in/u/<user>/<id>, ` +
        `https://poedb.tw/<locale>/PathOfBuilding?id=<id>, or a bare pobb.in ID.`
    );

  if (!trimmed) throw new Error("url_or_id is required");

  if (!trimmed.includes("/") && !trimmed.includes(".")) {
    if (!ID_PATTERN.test(trimmed)) throw unsupported();
    return pobbTarget(trimmed);
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw unsupported();
  }
  if (url.protocol !== "https:") throw new Error("Only https:// links are supported.");
  if (url.username || url.password || url.port) throw unsupported();

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error("Only pobb.in and poedb.tw links are supported.");
  }

  if (host === "poedb.tw") {
    const id = url.searchParams.get("id") ?? "";
    if (!ID_PATTERN.test(id)) throw unsupported();
    return {
      source: "poedb.tw",
      id,
      rawUrl: `https://poedb.tw/pob/${id}/raw`,
      pageUrl: `https://poedb.tw/us/PathOfBuilding?id=${id}`,
    };
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[0] === "u" && parts.length === 3 ? parts[2] : parts.length === 1 ? parts[0] : "";
  if (!ID_PATTERN.test(id)) throw unsupported();
  return pobbTarget(id);
}

function pobbTarget(id: string): PobShareTarget {
  return {
    source: "pobb.in",
    id,
    rawUrl: `https://pobb.in/${id}/raw`,
    pageUrl: `https://pobb.in/${id}`,
  };
}

function assertAllowed(url: URL): void {
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(host) || url.port) {
    throw new Error(`Refusing to follow request to ${url.protocol}//${host}: only https pobb.in and poedb.tw are allowed.`);
  }
}

/**
 * GET the raw export code. Redirects are followed manually and only within the
 * allowlist; the body is read as a stream and aborted past the size cap.
 */
export async function fetchPobShareCode(
  target: PobShareTarget,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POB_SHARE_TIMEOUT_MS);
  try {
    let url = new URL(target.rawUrl);
    let res: Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      assertAllowed(url);
      res = await fetchImpl(url.toString(), {
        headers: { "User-Agent": USER_AGENT, Accept: "text/plain, */*" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error(`Redirect without Location from ${target.source}.`);
        if (hop === MAX_REDIRECTS) throw new Error(`Too many redirects from ${target.source}.`);
        url = new URL(loc, url);
        continue;
      }
      break;
    }
    if (!res) throw new Error("No response");

    if (!res.ok) {
      if (res.status === 404) throw new Error(`Build not found on ${target.source} (404). Check the link or ID.`);
      if (res.status === 403) throw new Error(`${target.source} returned 403 Forbidden. The build may be private.`);
      throw new Error(`${target.source} request failed: HTTP ${res.status}`);
    }

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > POB_SHARE_MAX_BYTES) throw new Error(`Response from ${target.source} is too large.`);

    const chunks: Uint8Array[] = [];
    let total = 0;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > POB_SHARE_MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new Error(`Response from ${target.source} is too large.`);
        }
        chunks.push(value);
      }
    }
    const code = Buffer.concat(chunks).toString("utf8").trim();
    if (!code || /[^A-Za-z0-9+/_=\-\s]/.test(code)) {
      throw new Error(`${target.source} did not return a valid PoB export code.`);
    }
    return code;
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      throw new Error(`Request to ${target.source} timed out after ${POB_SHARE_TIMEOUT_MS}ms.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
