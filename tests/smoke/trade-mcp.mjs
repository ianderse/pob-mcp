// Opt-in live MCP smoke test for the Path of Exile Trade API.
// Usage: npm run build && npm run test:smoke:trade
import { startMcpServer } from './mcpClient.mjs';

const { child, request, notify } = startMcpServer({ POB_LUA_ENABLED: 'false', POE_TRADE_ENABLED: 'true' });

const call = async (name, args = {}) => {
  const response = await request('tools/call', { name, arguments: args });
  if (response.error || response.result?.isError) throw new Error(`${name} failed: ${JSON.stringify(response.error ?? response.result)}`);
  return response.result?.content?.[0]?.text || '';
};

try {
  await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'trade-smoke', version: '1.0' } });
  notify('notifications/initialized', {});
  const listed = await request('tools/list', {});
  const names = new Set(listed.result.tools.map((tool) => tool.name));
  for (const name of ['get_leagues', 'search_stats', 'search_trade_items', 'get_item_price', 'find_resistance_gear', 'get_currency_rates', 'calculate_trading_profit']) {
    if (!names.has(name)) throw new Error(`missing live trade MCP tool: ${name}`);
  }

  const leagues = await call('get_leagues');
  if (!leagues.includes('=== Available Leagues ===') || !leagues.includes('Standard')) throw new Error(`league lookup was incomplete: ${leagues}`);
  const stats = await call('search_stats', { query: 'maximum life', limit: 1 });
  if (!stats.includes('=== Stat Search Results')) throw new Error(`stat lookup was incomplete: ${stats}`);
  const search = await call('search_trade_items', { league: 'Standard', item_name: 'Tabula Rasa', item_rarity: 'unique', max_price: 1, price_currency: 'divine', limit: 1 });
  if (!search.includes('=== Trade Search (Standard) ===') && !search.includes('No items found')) throw new Error(`trade search was incomplete: ${search}`);
  const price = await call('get_item_price', { league: 'Standard', item_name: 'Tabula Rasa', rarity: 'unique' });
  if (!price.includes('=== Price Check: Tabula Rasa ===') && !price.includes('No price data found')) throw new Error(`price check was incomplete: ${price}`);
  const resistance = await call('find_resistance_gear', { league: 'Standard', fire_resist_needed: 10, slots: ['Ring 1'], limit: 1 });
  if (!resistance.includes('=== Resistance Gear (Standard) ===') && !resistance.includes('No resistance gear found')) throw new Error(`resistance recommendation was incomplete: ${resistance}`);
  const rates = await call('get_currency_rates', { league: 'Standard' });
  if (!rates.includes('=== Currency Exchange Rates ===') || !rates.includes('Divine Orb')) throw new Error(`currency rates were incomplete: ${rates}`);
  const profit = await call('calculate_trading_profit', { league: 'Standard', currency_chain: ['Chaos Orb', 'Divine Orb', 'Chaos Orb'], start_amount: 10 });
  if (!profit.includes('=== Trading Chain Profit Calculation ===') || !profit.includes('=== Profit Analysis ===')) throw new Error(`trading profit was incomplete: ${profit}`);
  console.log('trade MCP passed: tool discovery, leagues, stat lookup, item search, price check, resistance recommendations, currency rates, and trading profit all succeeded');
} finally {
  child.kill();
}
