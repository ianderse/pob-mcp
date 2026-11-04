export function formatBaseSlug(base: string): string {
  return base.replace(/ /g, '_');
}

/**
 * Lightly processes poedb HTML into plain text sections useful for Claude.
 * We don't need perfect parsing — Claude can interpret semi-structured text.
 */
export function parsePoedbText(html: string, base: string): string {
  // Strip script/style tags
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, '\n')
    .trim();

  return `=== poedb data for: ${base} ===\n\n${text.slice(0, 8000)}`;
}

interface CraftingBaseData {
  base: string;
  poedbUrl: string;
  modText: string;
}

export async function fetchBaseModData(base: string): Promise<CraftingBaseData> {
  const slug = formatBaseSlug(base);
  const url = `https://poedb.tw/us/${encodeURIComponent(slug)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'pob-mcp-server/1.0 (crafting advisor)',
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`poedb network error for "${base}": ${cause}`);
  }

  if (!response.ok) {
    throw new Error(`poedb fetch failed for "${base}": ${response.status}`);
  }

  const html = await response.text();
  const modText = parsePoedbText(html, base);

  return { base, poedbUrl: url, modText };
}
