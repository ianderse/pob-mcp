/**
 * Cluster Jewel Trade Handlers
 *
 * Specialized handlers for searching and analyzing cluster jewels
 */

import { wrapHandler } from '../utils/errorHandling.js';
import { TradeApiClient } from '../services/tradeClient.js';
import { TradeQueryBuilder } from '../services/tradeQueryBuilder.js';
import { StatMapper } from '../services/statMapper.js';
import { PoeNinjaClient } from '../services/poeNinjaClient.js';
import { ItemListing } from '../types/tradeTypes.js';
import type { PoBLuaApiClient } from '../pobLuaBridge.js';
import type { PoBItemEntry, PoBBuild } from '../types.js';

interface ClusterJewelContext {
  tradeClient: TradeApiClient;
  statMapper?: StatMapper;
  ninjaClient?: PoeNinjaClient;
}

type ClusterJewelSize = 'Large' | 'Medium' | 'Small';

/**
 * Search for cluster jewels with specific properties
 */
export async function handleSearchClusterJewels(
  context: ClusterJewelContext,
  args: {
    league: string;
    size: ClusterJewelSize;
    passive_count?: number;
    enchant?: string;
    notables?: string[];
    min_item_level?: number;
    max_price?: number;
    price_currency?: string;
    online_only?: boolean;
    limit?: number;
  }
): Promise<{
  content: Array<{
    type: string;
    text: string;
  }>;
}> {
  return wrapHandler('search cluster jewels', async () => {
    const {
      league,
      size,
      passive_count,
      enchant,
      notables = [],
      min_item_level,
      max_price,
      price_currency = 'chaos',
      online_only = true,
      limit = 5,
    } = args;

    // Build the query
    const builder = new TradeQueryBuilder();

    // Set cluster jewel base type
    const baseTypeName = `${size} Cluster Jewel`;
    builder.withType(baseTypeName);

    // Set rarity to magic or rare (cluster jewels are typically these)
    // Most useful cluster jewels are magic (blue) or rare (yellow)

    // Add passive count filter if specified
    if (passive_count) {
      // This is an implicit mod: "Adds X Passive Skills"
      // We'll need to search by the implicit mod text
      builder.withStats([{
        id: 'implicit.stat_3948993189', // "Adds # Passive Skills"
        min: passive_count,
        max: passive_count,
      }]);
    }

    // Add enchantment filter if specified
    if (enchant) {
      // Note: Trade API doesn't provide simple text search for cluster jewel enchantments
      // Enchantments are in the "Added Small Passive Skills grant:" format
      // We fetch extra items and filter client-side for best results
    }

    // Add notable filters if specified
    if (notables.length > 0) {
      // Note: Notables use "Allocates X" format
      // Trade API stat IDs for these are complex and item-specific
      // We filter these client-side after fetching results for reliability
    }

    // Add item level filter
    if (min_item_level) {
      builder.withItemLevel(min_item_level);
    }

    // Apply search options
    builder.applyOptions({
      league,
      onlineOnly: online_only,
      maxPrice: max_price,
      priceCurrency: price_currency,
      sort: 'price_asc',
      limit: limit * 3, // Fetch more to filter by enchant/notables
    });

    const query = builder.build();

    // Execute search
    const searchResult = await context.tradeClient.searchItems(league, query);

    if (!searchResult.result || searchResult.result.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No ${size} cluster jewels found matching your criteria in ${league} league.`,
          },
        ],
      };
    }

    // Fetch items
    const itemIdsToFetch = searchResult.result.slice(0, Math.min(limit * 3, 30));
    const items = await context.tradeClient.fetchItems(itemIdsToFetch, searchResult.id);

    // Filter by enchantment and notables if specified
    let filteredItems = items;

    if (enchant) {
      filteredItems = filteredItems.filter(item => {
        const enchantMods = item.item.enchantMods || [];
        return enchantMods.some(mod =>
          mod.toLowerCase().includes(enchant.toLowerCase())
        );
      });
    }

    if (notables.length > 0) {
      filteredItems = filteredItems.filter(item => {
        const explicitMods = item.item.explicitMods || [];
        const allocatedNotables = explicitMods
          .filter(mod => mod.includes('Allocates'))
          .map(mod => {
            // Extract notable name from "Allocates X" format
            const match = mod.match(/Allocates (.+)/);
            return match ? match[1] : '';
          });

        // Check if all requested notables are present
        return notables.every(notable =>
          allocatedNotables.some(allocated =>
            allocated.toLowerCase().includes(notable.toLowerCase())
          )
        );
      });
    }

    // Limit to requested count
    filteredItems = filteredItems.slice(0, limit);

    if (filteredItems.length === 0) {
      let filterMsg = `No ${size} cluster jewels found with`;
      if (enchant) filterMsg += ` enchant containing "${enchant}"`;
      if (notables.length > 0) {
        if (enchant) filterMsg += ' and';
        filterMsg += ` notables: ${notables.join(', ')}`;
      }
      filterMsg += ` in ${league} league.`;

      return {
        content: [
          {
            type: 'text',
            text: filterMsg,
          },
        ],
      };
    }

    // Format results
    const output = formatClusterJewelResults(
      filteredItems,
      size,
      searchResult.total,
      league,
      searchResult.id
    );

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  });
}

/**
 * Format cluster jewel search results
 */
function formatClusterJewelResults(
  items: ItemListing[],
  size: ClusterJewelSize,
  totalResults: number,
  league: string,
  searchId: string
): string {
  let output = `=== ${size} Cluster Jewel Search Results ===\n`;
  output += `League: ${league}\n`;
  output += `Total Results: ${totalResults}\n`;
  output += `Showing: ${items.length} items\n\n`;
  output += `🔗 View full results: https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${searchId}\n\n`;

  for (let i = 0; i < items.length; i++) {
    const listing = items[i];
    const item = listing.item;
    const price = listing.listing.price;
    const seller = listing.listing.account;

    output += `${i + 1}. ${item.name || item.typeLine}\n`;

    // Item level and corruption status
    output += `   ilvl: ${item.ilvl}`;
    if (item.corrupted) {
      output += ' (Corrupted)';
    }
    output += '\n';

    // Price
    if (price) {
      output += `   Price: ${price.amount} ${price.currency}\n`;
    } else {
      output += `   Price: Not listed\n`;
    }

    // Parse passive count from implicit mods
    const passiveCount = extractPassiveCount(item);
    if (passiveCount) {
      output += `   Passives: Adds ${passiveCount} Passive Skills\n`;
    }

    // Show enchantments (these define the small passive bonuses)
    if (item.enchantMods && item.enchantMods.length > 0) {
      output += `   Enchant:\n`;
      for (const enchant of item.enchantMods) {
        output += `     • ${enchant}\n`;
      }
    }

    // Show notables (explicit mods that allocate notable passives)
    const notables = extractNotables(item);
    if (notables.length > 0) {
      output += `   Notables:\n`;
      for (const notable of notables) {
        output += `     ⭐ ${notable}\n`;
      }
    }

    // Show other explicit mods (non-notable mods)
    const otherMods = (item.explicitMods || []).filter(mod => !mod.includes('Allocates'));
    if (otherMods.length > 0) {
      output += `   Other Mods:\n`;
      for (const mod of otherMods.slice(0, 3)) {
        output += `     • ${mod}\n`;
      }
      if (otherMods.length > 3) {
        output += `     ... +${otherMods.length - 3} more\n`;
      }
    }

    // Seller info
    output += `   Seller: ${seller.name}`;
    if (seller.online) {
      output += ' (Online)';
    }
    output += '\n';

    // Whisper command
    if (listing.listing.whisper) {
      output += `   Whisper: ${listing.listing.whisper}\n`;
    }

    output += `   🔗 View: https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${searchId}#${listing.id}\n`;
    output += '\n';
  }

  return output;
}

/**
 * Extract passive count from cluster jewel implicit mods
 */
/** One parsed cluster jewel (this file's light-weight view of PoB item text). */
interface ParsedClusterJewel {
  slot: string | undefined;
  rarity: string;
  name: string;
  baseType: string;
  itemLevel: number;
  passiveCount: number | null;
  size?: 'Large' | 'Medium' | 'Small';
  enchantments: string[];
  notables: string[];
  mods: string[];
}

function extractPassiveCount(item: { implicitMods?: string[] }): number | null {
  const implicitMods = item.implicitMods || [];

  for (const mod of implicitMods) {
    const match = mod.match(/Adds (\d+) Passive Skills?/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

/**
 * Extract notable names from cluster jewel explicit mods
 */
function extractNotables(item: { explicitMods?: string[] }): string[] {
  const explicitMods = item.explicitMods || [];
  const notables: string[] = [];

  for (const mod of explicitMods) {
    const match = mod.match(/Allocates (.+)/);
    if (match) {
      notables.push(match[1]);
    }
  }

  return notables;
}

/**
 * Analyze cluster jewels equipped in a build
 */
export async function handleAnalyzeClusterJewels(
  context: { buildService: { readBuild: (name: string) => Promise<PoBBuild> } },
  args: {
    build_name: string;
  }
): Promise<{
  content: Array<{
    type: string;
    text: string;
  }>;
}> {
  return wrapHandler('analyze cluster jewels', async () => {
    const { build_name } = args;

    // Read the build
    const build = await context.buildService.readBuild(build_name);

    // Find cluster jewels in the build
    const clusterJewels = findClusterJewelsInBuild(build);

    if (clusterJewels.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No cluster jewels found in build "${build_name}".`,
          },
        ],
      };
    }

    // Format the analysis
    let output = `=== Cluster Jewel Analysis: ${build_name} ===\n\n`;
    output += `Found ${clusterJewels.length} cluster jewel${clusterJewels.length > 1 ? 's' : ''}:\n\n`;

    for (let i = 0; i < clusterJewels.length; i++) {
      const jewel = clusterJewels[i];
      output += formatClusterJewelAnalysis(jewel, i + 1);
      output += '\n';
    }

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  });
}

/**
 * Find cluster jewels in a PoB build.
 * readBuild() returns the PathOfBuilding element already UNWRAPPED, and tree
 * jewels are NOT inside any gear ItemSet — their rendered text lives in
 * Items/Item regardless of which set is equipped. Iterating Items/Item is
 * both the correct and the only navigation needed.
 */
function findClusterJewelsInBuild(build: PoBBuild): ParsedClusterJewel[] {
  const clusterJewels: ParsedClusterJewel[] = [];

  const rawItems = build?.Items?.Item;
  if (!rawItems) return clusterJewels;
  const itemList = Array.isArray(rawItems) ? rawItems : [rawItems];

  for (const item of itemList) {
    if (!item || !item['#text']) continue;

    const itemText: string = item['#text'];
    if (itemText.includes('Cluster Jewel')) {
      clusterJewels.push(parseClusterJewelItem(item, itemText));
    }
  }

  return clusterJewels;
}

/**
 * Parse a cluster jewel item from PoB format
 */
function parseClusterJewelItem(item: PoBItemEntry, itemText: string): ParsedClusterJewel {
  const lines = itemText.split('\n');

  const jewel: ParsedClusterJewel = {
    slot: item.id,
    rarity: 'Unknown',
    name: '',
    baseType: '',
    itemLevel: 0,
    passiveCount: null,
    enchantments: [],
    notables: [],
    mods: [],
  };

  let currentSection = 'header';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Parse rarity
    if (trimmed.startsWith('Rarity:')) {
      jewel.rarity = trimmed.replace('Rarity:', '').trim();
      continue;
    }

    // Parse name and base type
    if (currentSection === 'header' && !trimmed.startsWith('Rarity:')) {
      if (!jewel.name) {
        jewel.name = trimmed;
      } else if (trimmed.includes('Cluster Jewel')) {
        jewel.baseType = trimmed;

        // Extract size from base type
        if (trimmed.includes('Large')) jewel.size = 'Large';
        else if (trimmed.includes('Medium')) jewel.size = 'Medium';
        else if (trimmed.includes('Small')) jewel.size = 'Small';

        currentSection = 'properties';
      }
      continue;
    }

    // Parse item level
    if (trimmed.startsWith('Item Level:')) {
      jewel.itemLevel = parseInt(trimmed.replace('Item Level:', '').trim(), 10);
      continue;
    }

    // Parse passive count
    if (trimmed.match(/Adds \d+ Passive Skills?/)) {
      const match = trimmed.match(/Adds (\d+) Passive Skills?/);
      if (match) {
        jewel.passiveCount = parseInt(match[1], 10);
      }
      continue;
    }

    // Parse enchantments (these contain "Added Small Passive Skills grant:")
    if (trimmed.includes('Added Small Passive Skills grant:') || trimmed.includes('Added Passive Skills are:')) {
      jewel.enchantments.push(trimmed);
      continue;
    }

    // Parse notables (lines containing "Allocates")
    if (trimmed.includes('Allocates')) {
      const match = trimmed.match(/Allocates (.+)/);
      if (match) {
        jewel.notables.push(match[1]);
      }
      continue;
    }

    // Other explicit mods
    if (trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.match(/^\d+%/)) {
      jewel.mods.push(trimmed);
    }
  }

  return jewel;
}

/**
 * Format cluster jewel analysis output
 */
function formatClusterJewelAnalysis(jewel: ParsedClusterJewel, index: number): string {
  let output = `${index}. ${jewel.name || jewel.baseType}\n`;
  output += `   Base: ${jewel.baseType}\n`;
  output += `   Rarity: ${jewel.rarity}\n`;
  output += `   Item Level: ${jewel.itemLevel}\n`;

  if (jewel.passiveCount) {
    output += `   Passive Skills: Adds ${jewel.passiveCount}\n`;
  }

  if (jewel.enchantments.length > 0) {
    output += `   Enchantments:\n`;
    for (const enchant of jewel.enchantments) {
      output += `     • ${enchant}\n`;
    }
  }

  if (jewel.notables.length > 0) {
    output += `   Notables:\n`;
    for (const notable of jewel.notables) {
      output += `     ⭐ ${notable}\n`;
    }
  }

  if (jewel.mods.length > 0) {
    output += `   Other Mods:\n`;
    for (const mod of jewel.mods) {
      output += `     • ${mod}\n`;
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// Build Cluster Jewel Analyzer — evaluates EQUIPPED cluster jewels
// ---------------------------------------------------------------------------

interface ClusterJewelBuildContext {
  getLuaClient: () => PoBLuaApiClient | null;
  ensureLuaClient: () => Promise<void>;
}

// Notable → relevant build-type tags
const CLUSTER_NOTABLE_TAGS: Record<string, string[]> = {
  'Feasting Fiends':       ['minion', 'leech'],
  'Renewal':               ['minion', 'life_regen'],
  'Vicious Bite':          ['minion', 'critical'],
  'Pure Agony':            ['minion', 'ailment'],
  'Disciples':             ['minion', 'aura'],
  'Dread March':           ['minion', 'movement'],
  'Hulking Corpses':       ['minion', 'tankiness'],
  'Heraldry':              ['herald', 'damage'],
  'Grand Design':          ['es', 'reservation'],
  'Flow of Life':          ['life', 'leech'],
  'Fearless Assault':      ['attack', 'stun'],
  'Martial Prowess':       ['attack', 'accuracy'],
  'Fuel the Fight':        ['attack', 'mana'],
  'Drive the Destruction': ['attack', 'damage'],
  'Force Multiplier':      ['attack', 'critical'],
  'Vengeful Commander':    ['aura', 'damage'],
  'Stalwart Commander':    ['aura', 'life'],
  'Precise Commander':     ['aura', 'critical'],
  'Wish for Death':        ['chaos', 'damage'],
  'Touch of Cruelty':      ['chaos', 'debuff'],
  'Unwaveringly Evil':     ['chaos', 'damage'],
  'Cold to the Core':      ['cold', 'penetration'],
  'Prismatic Heart':       ['cold', 'damage'],
  'Widespread Destruction':['area', 'damage'],
  'Smoking Remains':       ['fire', 'damage'],
  'Burning Bright':        ['fire', 'ignite'],
  'Snowforged':            ['cold', 'freeze'],
  'Stormrider':            ['lightning', 'shock'],
  'Supercharged':          ['lightning', 'critical'],
};

function inferClusterArchetype(gemNames: string[]): string[] {
  const joined = gemNames.map(n => n.toLowerCase()).join(' ');
  const tags: string[] = [];
  if (/summon|relic|skeleton|spectre|golem/.test(joined)) tags.push('minion');
  if (/herald of/.test(joined)) tags.push('herald');
  if (/essence drain|bane|dark pact|caustic arrow/.test(joined)) tags.push('chaos');
  if (/fireball|scorching|ignite|cremation|incinerate/.test(joined)) tags.push('fire');
  if (/arc|storm brand|ball lightning|lightning/.test(joined)) tags.push('lightning');
  if (/frostbolt|ice nova|cold snap|freezing pulse/.test(joined)) tags.push('cold');
  if (/penance|righteous|sacred|ancestral/.test(joined)) tags.push('aura');
  return tags.length > 0 ? tags : ['generic'];
}

export async function handleAnalyzeBuildClusterJewels(context: ClusterJewelBuildContext) {
  await context.ensureLuaClient();
  const luaClient = context.getLuaClient();
  if (!luaClient) throw new Error('Lua bridge not active. Use lua_load_build first.');

  const items = await luaClient.getItems();
  const clusterJewels = items.filter((item) => {
    // PoB's field is `baseName` (get_items maps it.baseName); the previous
    // `item.base` was always undefined → this filter matched NOTHING and
    // the tool always reported "No cluster jewels detected".
    const base: string = item.baseName || '';
    if (!
      (base.includes('Cluster Jewel') ||
       base.includes('Large Jewel') ||
       base.includes('Medium Jewel') ||
       base.includes('Small Jewel'))
    ) return false;
    // Socketed passive-tree jewels arrive as "Amber Watcher [Large Cluster
    // Jewel]" in name — accept that too; socket slot naming is PoB-version
    // dependent and must not be the only accept path.
    const nameIsJewel = /\[[^\]]*Jewel[^\]]*\]/.test(item.name || '');
    const slotIsJewel = String(item.slot).toLowerCase().includes('jewel');
    return nameIsJewel || slotIsJewel;
  });

  if (clusterJewels.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: '=== Cluster Jewel Analysis ===\n\nNo cluster jewels detected in equipped items.\nEnsure a build with cluster jewels is loaded.',
      }],
    };
  }

  // Detect build archetype from skills
  const skills = await luaClient.getSkills();
  const gemNames: string[] = [];
  for (const group of (skills?.groups ?? [])) {
    for (const gem of (group.gems ?? [])) gemNames.push(gem.name);
  }
  const archetypeTags = inferClusterArchetype(gemNames);

  let output = '=== Cluster Jewel Analysis ===\n';
  output += `**Build Archetype Tags:** ${archetypeTags.join(', ')}\n\n`;

  for (const jewel of clusterJewels) {
    const raw: string = jewel.raw || '';
    output += `### ${jewel.name || jewel.baseName} (${jewel.slot})\n`;
    output += `Base: ${jewel.baseName}\n`;

    // Find any known notable names mentioned in the raw item text
    const foundNotables = Object.keys(CLUSTER_NOTABLE_TAGS).filter(n => raw.includes(n));

    if (foundNotables.length > 0) {
      output += `Notables:\n`;
      for (const notable of foundNotables) {
        const tags = CLUSTER_NOTABLE_TAGS[notable] ?? [];
        const relevant = tags.some(t => archetypeTags.includes(t));
        const icon = relevant ? '✅' : '⚠️';
        output += `  ${icon} ${notable} [${tags.join(', ')}]${relevant ? '' : ' — may not synergize with your build archetype'}\n`;
      }
    } else {
      output += `  (Could not parse notables — ensure item raw text contains notable names)\n`;
    }
    output += '\n';
  }

  output += `_To search for better cluster jewels, use \`search_cluster_jewels\` with the trade API._\n`;

  return { content: [{ type: 'text' as const, text: output }] };
}
