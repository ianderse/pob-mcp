// Opt-in live MCP smoke test for the Path of Exile Trade API.
// Usage: npm run build && npm run test:smoke:trade
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const child = spawn('node', [resolve('build/index.js')], {
  env: { ...process.env, POE_TRADE_ENABLED: 'true' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = ''; let nextId = 1; const pending = new Map();
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf('\n'); if (newline < 0) return;
    const message = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
    pending.get(message.id)?.(message); pending.delete(message.id);
  }
});
const request = (method, params) => new Promise((resolveRequest, reject) => {
  const id = nextId++; pending.set(id, resolveRequest);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  setTimeout(() => { if (pending.delete(id)) reject(new Error(`timed out: ${method}`)); }, 60_000);
});
const call = async (name, args = {}) => {
  const response = await request('tools/call', { name, arguments: args });
  if (response.error || response.result?.isError) throw new Error(`${name} failed: ${JSON.stringify(response.error ?? response.result)}`);
  return response.result?.content?.[0]?.text || '';
};

try {
  await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'trade-smoke', version: '1.0' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
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
