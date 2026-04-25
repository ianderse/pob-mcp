/**
 * PoE Character API Client
 *
 * Thin wrapper around the official Path of Exile character-window endpoints.
 * PoB headless does not have HTTP support (lcurl is disabled), so all HTTP
 * requests must happen on the Node side and the resulting JSON body is
 * forwarded to the Lua side via the import_passive_tree / import_items_skills
 * JSON-RPC handlers.
 *
 * Endpoints used:
 *   - GET /character-window/get-characters
 *   - GET /character-window/get-passive-skills
 *   - GET /character-window/get-items
 *
 * Notes:
 *   - Account names use a discriminator like `account#1234`. The `#` MUST be
 *     URL-encoded as `%23` (the PoE API does not accept the bare `#`).
 *   - A `User-Agent` header is required by the PoE API.
 *   - Private profiles require a POESESSID cookie (passed via sessionId arg
 *     or POE_SESSION_ID env var).
 */

const BASE_URL = "https://www.pathofexile.com";
// GGG's API requires an identifying User-Agent. Keep this in sync with the
// `version` field in package.json — current value should match the published
// MCP server version so support requests can correlate.
const USER_AGENT = "pob-mcp/1.0.0";

export type PoeRealm = "pc" | "xbox" | "sony";

/** Character entry returned by /character-window/get-characters.
 *  Confirmed fields from the live API (2026-04 capture):
 *    name, realm, class, league, level, lastLoginTime (unix seconds), pinnable.
 *  Other fields (classId, ascendancyClass, etc.) are NOT returned — `class`
 *  contains the ascendancy name directly (e.g. "Saboteur", "Chieftain"). */
export interface PoeCharacterListEntry {
  name: string;
  realm?: string;
  class?: string;
  league?: string;
  level?: number;
  lastLoginTime?: number;
  pinnable?: boolean;
  // Pass-through for any future fields the API adds.
  [key: string]: unknown;
}

/** Encode an account name for the query string (PoE requires `#` as `%23`). */
function encodeAccountName(accountName: string): string {
  // encodeURIComponent escapes `#` to `%23` and handles every other character
  // the API rejects when sent raw.
  return encodeURIComponent(accountName);
}

/** Default per-request timeout for PoE API calls (ms). */
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Wrap a fetch call with an AbortController so a hung connection cannot block
 * the bridge indefinitely. Returns the Response on success and re-throws with
 * a clearer message on timeout.
 */
async function fetchWithTimeout(url: string, init: RequestInit, context: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      throw new Error(`PoE API request timed out after ${DEFAULT_TIMEOUT_MS}ms (${context}).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the standard headers for a PoE API request.
 * Adds the Cookie header when a sessionId is available.
 */
function buildHeaders(sessionId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
  const effectiveSessionId =
    sessionId !== undefined ? sessionId : process.env.POE_SESSION_ID;
  if (effectiveSessionId) {
    headers["Cookie"] = `POESESSID=${effectiveSessionId}`;
  }
  return headers;
}

/**
 * Map a non-2xx HTTP response to a friendly Error message.
 * Reads the body as text so it can be included for diagnostic value.
 */
async function throwForResponse(res: Response, context: string): Promise<never> {
  if (res.status === 403) {
    throw new Error(
      "Profile is private. Set POE_SESSION_ID env var or make profile public."
    );
  }
  if (res.status === 404) {
    throw new Error(
      "Character not found. Check account name (with discriminator like account#1234) and character name."
    );
  }
  if (res.status === 429) {
    throw new Error("Rate limited by PoE API. Wait a few seconds and retry.");
  }
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* ignore — body might already be consumed */
  }
  const snippet = body.length > 500 ? body.slice(0, 500) + "..." : body;
  throw new Error(
    `PoE API request failed (${context}): HTTP ${res.status} ${res.statusText}${snippet ? " — " + snippet : ""}`
  );
}

/**
 * Fetch the list of characters for an account.
 *
 * @param accountName Account name including discriminator (e.g. `account#1234`).
 * @param realm Defaults to `pc`.
 * @param sessionId Optional POESESSID; falls back to POE_SESSION_ID env var.
 */
export async function fetchCharacterList(
  accountName: string,
  realm: PoeRealm = "pc",
  sessionId?: string
): Promise<PoeCharacterListEntry[]> {
  if (!accountName || !accountName.trim()) {
    throw new Error("accountName is required");
  }
  const url = `${BASE_URL}/character-window/get-characters?accountName=${encodeAccountName(
    accountName
  )}&realm=${encodeURIComponent(realm)}`;

  const res = await fetchWithTimeout(url, { headers: buildHeaders(sessionId) }, "get-characters");
  if (!res.ok) {
    await throwForResponse(res, "get-characters");
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error(
      `Unexpected response from PoE API (get-characters): expected array, got ${typeof data}`
    );
  }
  return data as PoeCharacterListEntry[];
}

/**
 * Fetch the raw passive-skills JSON body for a character.
 * Returns the body as a string so the Lua importer can parse it itself.
 */
export async function fetchPassiveSkills(
  accountName: string,
  characterName: string,
  realm: PoeRealm = "pc",
  sessionId?: string
): Promise<string> {
  if (!accountName || !accountName.trim()) {
    throw new Error("accountName is required");
  }
  if (!characterName || !characterName.trim()) {
    throw new Error("characterName is required");
  }
  const url = `${BASE_URL}/character-window/get-passive-skills?accountName=${encodeAccountName(
    accountName
  )}&character=${encodeURIComponent(characterName)}&realm=${encodeURIComponent(realm)}`;

  const res = await fetchWithTimeout(url, { headers: buildHeaders(sessionId) }, "get-passive-skills");
  if (!res.ok) {
    await throwForResponse(res, "get-passive-skills");
  }
  return await res.text();
}

/**
 * Fetch the raw items JSON body for a character.
 * Returns the body as a string so the Lua importer can parse it itself.
 */
export async function fetchItems(
  accountName: string,
  characterName: string,
  realm: PoeRealm = "pc",
  sessionId?: string
): Promise<string> {
  if (!accountName || !accountName.trim()) {
    throw new Error("accountName is required");
  }
  if (!characterName || !characterName.trim()) {
    throw new Error("characterName is required");
  }
  const url = `${BASE_URL}/character-window/get-items?accountName=${encodeAccountName(
    accountName
  )}&character=${encodeURIComponent(characterName)}&realm=${encodeURIComponent(realm)}`;

  const res = await fetchWithTimeout(url, { headers: buildHeaders(sessionId) }, "get-items");
  if (!res.ok) {
    await throwForResponse(res, "get-items");
  }
  return await res.text();
}
