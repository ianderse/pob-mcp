import { wrapHandler } from '../utils/errorHandling.js';
import type { PoBLuaApiClient } from '../pobLuaBridge.js';

interface AnointHandlerContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
}

/**
 * Find the best anointable notable for the loaded build by simulating the
 * impact of each anoint candidate via PoB's MiscCalculator (non-destructive,
 * same mechanism the GUI uses to sort anoints in the item picker).
 *
 * Requires an anointable item equipped in the target slot:
 * - Amulet (any base)
 * - Belt: Cord Belt only
 */
export async function handleFindBestAnointment(
  context: AnointHandlerContext,
  args: { slot: string; focus?: 'dps' | 'defence' | 'both'; max_results?: number },
) {
  return wrapHandler('find best anointment', async () => {
    await context.ensureLuaClient();
    const client = context.getLuaClient();
    if (!client) {
      throw new Error('Lua bridge not active. Use lua_start and lua_load_build first.');
    }

    if (!args || typeof args.slot !== 'string' || args.slot.trim() === '') {
      throw new Error('slot is required (e.g. "Amulet" or "Belt")');
    }
    const focus = args.focus ?? 'both';
    const maxResults = args.max_results ?? 10;

    const result = await client.evaluateAnointCandidates({
      slot: args.slot,
      focus,
      // Pull a generous candidate set; we display max_results.
      limit: Math.max(maxResults, 50),
    });

    const lines: string[] = [
      `=== Best Anointment (slot: ${result.slot} / ${result.baseType}, focus: ${result.focus}) ===`,
      '',
      `Base CombinedDPS: ${Math.round(result.base.CombinedDPS).toLocaleString()}  |  Base TotalEHP: ${Math.round(result.base.TotalEHP).toLocaleString()}`,
      `Evaluated ${result.evaluated} anointable notables (${result.skipped} skipped), showing top ${Math.min(maxResults, result.candidates.length)}:`,
      '',
    ];

    const top = result.candidates.slice(0, maxResults);
    for (let i = 0; i < top.length; i++) {
      const c = top[i];
      const dpsPct = result.base.CombinedDPS > 0 ? (c.dpsDelta / result.base.CombinedDPS) * 100 : 0;
      const ehpPct = result.base.TotalEHP > 0 ? (c.ehpDelta / result.base.TotalEHP) * 100 : 0;
      lines.push(
        `${i + 1}. **${c.name}** [${c.nodeId}]`,
        `   Score: ${c.score.toFixed(4)}  |  DPS Δ: ${c.dpsDelta >= 0 ? '+' : ''}${Math.round(c.dpsDelta).toLocaleString()} (${dpsPct >= 0 ? '+' : ''}${dpsPct.toFixed(2)}%)  |  EHP Δ: ${c.ehpDelta >= 0 ? '+' : ''}${Math.round(c.ehpDelta).toLocaleString()} (${ehpPct >= 0 ? '+' : ''}${ehpPct.toFixed(2)}%)`,
      );
      if (c.recipe && c.recipe.length > 0) {
        lines.push(`   Oils: ${c.recipe.join(' + ')}`);
      }
      lines.push('');
    }

    if (top.length === 0) {
      lines.push('No anointable candidates evaluated. Verify a build is loaded and the target slot has an anointable item.');
    }

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  });
}
