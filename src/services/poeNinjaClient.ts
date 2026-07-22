/**
 * poe.ninja API Client
 *
 * Fetches real-time currency rates and item prices from poe.ninja
 */

export interface CurrencyRate {
  currencyTypeName: string;
  chaosEquivalent: number;
  pay?: {
    value: number;
    count: number;
    listing_count: number;
  };
  receive?: {
    value: number;
    count: number;
    listing_count: number;
  };
  detailsId: string;
}

// New API format (poe1/api/economy/exchange/current)
export interface NewCurrencyLine {
  id: string;
  primaryValue: number;
  volumePrimaryValue?: number;
  maxVolumeCurrency?: string;
  maxVolumeRate?: number;
  sparkline?: {
    totalChange: number;
    data: number[];
  };
}

export interface NewCurrencyItem {
  id: string;
  name: string;
  image: string;
  category: string;
  detailsId: string;
}

export interface NewCurrencyOverview {
  core: {
    items: NewCurrencyItem[];
    rates: any;
    primary: string;
    secondary: string;
  };
  lines: NewCurrencyLine[];
  items: NewCurrencyItem[];
}

export interface CurrencyOverview {
  lines: CurrencyRate[];
  currencyDetails: Array<{
    id: number;
    name: string;
    tradeId?: string;
  }>;
}

/**
 * poe.ninja changed its economy endpoint from named `lines` with
 * `chaosEquivalent` to parallel item/rate collections. Normalize both shapes
 * at the boundary so callers do not need to care which API generation replied.
 */
export function normalizeCurrencyOverview(data: unknown): CurrencyOverview {
  const overview = data as Partial<NewCurrencyOverview & CurrencyOverview>;
  if (Array.isArray(overview.lines) && overview.lines.length > 0 && 'currencyTypeName' in overview.lines[0]) {
    return overview as CurrencyOverview;
  }

  const items = Array.isArray(overview.items) ? overview.items : [];
  const rates = Array.isArray(overview.lines) ? overview.lines : [];
  const itemById = new Map(items.map((item) => [item.id, item]));
  const rateById = new Map(rates.map((rate) => [rate.id, rate]));
  const chaosItem = items.find((item) => item.name === 'Chaos Orb');
  const chaosRate = chaosItem ? rateById.get(chaosItem.id) : undefined;
  // Fragment responses quote directly in chaos but omit a Chaos Orb line.
  const chaosPrimaryValue = chaosRate?.primaryValue ?? (overview.core?.primary === 'chaos' ? 1 : undefined);

  if (typeof chaosPrimaryValue !== 'number' || !Number.isFinite(chaosPrimaryValue) || chaosPrimaryValue <= 0) {
    throw new Error('poe.ninja API response did not contain a usable Chaos Orb rate');
  }

  const lines: CurrencyRate[] = [];
  for (const rate of rates) {
    const item = itemById.get(rate.id);
    const chaosEquivalent = rate.primaryValue / chaosPrimaryValue;
    if (!item?.name || !Number.isFinite(chaosEquivalent) || chaosEquivalent <= 0) continue;
    lines.push({
      currencyTypeName: item.name,
      chaosEquivalent,
      detailsId: item.detailsId,
    });
  }

  return {
    lines,
    currencyDetails: items.map((item, index) => ({ id: index, name: item.name, tradeId: item.detailsId })),
  };
}

export interface ArbitrageOpportunity {
  chain: string[];
  profitPercent: number;
  startAmount: number;
  endAmount: number;
  steps: Array<{
    from: string;
    to: string;
    rate: number;
    amount: number;
  }>;
}

/**
 * Client for fetching data from poe.ninja API
 */
export class PoeNinjaClient {
  private baseUrl = 'https://poe.ninja/poe1/api/economy/exchange/current';
  private legacyBaseUrl = 'https://poe.ninja/api/data';
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTTL = 300000; // 5 minutes

  /**
   * Get currency rates for a league
   */
  async getCurrencyRates(league: string): Promise<CurrencyOverview> {
    const cacheKey = `currency:${league}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `${this.baseUrl}/overview?league=${encodeURIComponent(league)}&type=Currency`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'pob-mcp-server/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`poe.ninja API request failed (${response.status}): ${await response.text()}`);
    }

    const data = normalizeCurrencyOverview(await response.json());
    this.putInCache(cacheKey, data);
    return data;
  }

  /**
   * Get fragment rates for a league
   */
  async getFragmentRates(league: string): Promise<CurrencyOverview> {
    const cacheKey = `fragment:${league}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `${this.baseUrl}/overview?league=${encodeURIComponent(league)}&type=Fragment`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'pob-mcp-server/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`poe.ninja API request failed (${response.status}): ${await response.text()}`);
    }

    const data = normalizeCurrencyOverview(await response.json());
    this.putInCache(cacheKey, data);
    return data;
  }

  /**
   * Build a currency exchange rate map (all rates in chaos equivalent)
   */
  async getCurrencyExchangeMap(league: string): Promise<Map<string, number>> {
    const data = await this.getCurrencyRates(league);
    const rateMap = new Map<string, number>();
    rateMap.set('Chaos Orb', 1.0);
    for (const line of data.lines) {
      if (line.currencyTypeName && line.chaosEquivalent > 0) {
        rateMap.set(line.currencyTypeName, line.chaosEquivalent);
      }
    }
    return rateMap;
  }

  /**
   * Get currency rates including bid/ask spread (pay/receive) for a league.
   *
   * The current exchange endpoint only exposes a single chaos-equivalent rate,
   * which is useless for arbitrage (buy==sell → every round trip is exactly 1.0).
   * The legacy currencyoverview endpoint still returns per-currency pay/receive
   * objects, so the arbitrage path fetches from it instead.
   */
  async getCurrencyRatesWithSpread(league: string): Promise<CurrencyOverview> {
    const cacheKey = `currency-spread:${league}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `${this.legacyBaseUrl}/currencyoverview?league=${encodeURIComponent(league)}&type=Currency`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'pob-mcp-server/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`poe.ninja API request failed (${response.status}): ${await response.text()}`);
    }

    const raw = (await response.json()) as Partial<CurrencyOverview> | null;
    const data: CurrencyOverview = {
      lines: Array.isArray(raw?.lines) ? raw!.lines : [],
      currencyDetails: Array.isArray(raw?.currencyDetails) ? raw!.currencyDetails : [],
    };
    this.putInCache(cacheKey, data);
    return data;
  }

  /**
   * Find arbitrage opportunities using bid/ask spread from currency exchange rates.
   *
   * Real arbitrage requires separate buy and sell rates. poe.ninja provides:
   *   receive.value = chaos received per unit sold (sell/ask rate)
   *   pay.value     = units of this currency per chaos paid (buy/bid rate, inverted)
   *
   * For a round-trip A→chaos→B→chaos→A to be profitable:
   *   (sellRate[A] / buyRate[B]) * (sellRate[B] / buyRate[A]) > 1
   *
   * Lines without both pay and receive are skipped — when buy==sell (no spread
   * data), round-trips always return exactly 1 (0% profit), which would silently
   * read as "no arbitrage".
   */
  async findArbitrageOpportunities(league: string, minProfitPercent: number = 1.0): Promise<ArbitrageOpportunity[]> {
    const overview = await this.getCurrencyRatesWithSpread(league);
    const opportunities: ArbitrageOpportunity[] = [];

    // Build separate buy-rate and sell-rate maps (all in chaos per unit).
    // sell = chaos you receive per unit when selling
    // buy  = chaos you pay per unit when buying
    const sellRate = new Map<string, number>(); // chaos received when selling 1 unit
    const buyRate  = new Map<string, number>(); // chaos spent when buying  1 unit

    sellRate.set('Chaos Orb', 1.0);
    buyRate.set('Chaos Orb', 1.0);

    for (const line of overview.lines) {
      const name = line.currencyTypeName;
      if (!name) continue;

      // receive.value: chaos per unit of this currency (sell side)
      const sell = line.receive?.value;
      // pay.value: expressed as [units-of-currency per chaos], so invert it
      // to get chaos per unit of this currency when buying (buy side).
      const pay = line.pay?.value;

      if (sell != null && sell > 0 && pay != null && pay > 0) {
        sellRate.set(name, sell);
        buyRate.set(name, 1 / pay);
      }
    }

    // Only Chaos Orb present means no line carried pay/receive data. Returning
    // an empty list here would falsely read as "no arbitrage opportunities".
    if (sellRate.size <= 1) {
      throw new Error(
        `poe.ninja spread data (pay/receive rates) unavailable for league "${league}" — cannot compute arbitrage opportunities`
      );
    }

    const currencies = Array.from(sellRate.keys());

    // 2-step: A → chaos → B → chaos → A
    for (let i = 0; i < currencies.length; i++) {
      const A = currencies[i];
      const sA = sellRate.get(A)!;
      const bA = buyRate.get(A)!;

      for (let j = 0; j < currencies.length; j++) {
        if (i === j) continue;
        const B = currencies[j];
        const sB = sellRate.get(B)!;
        const bB = buyRate.get(B)!;

        // Sell A → chaos, buy B, sell B → chaos, buy A back
        const chaosAfterSellA = sA;               // sell 1 A
        const unitsB         = chaosAfterSellA / bB; // buy B
        const chaosAfterSellB = unitsB * sB;      // sell B
        const finalA         = chaosAfterSellB / bA; // buy A back

        const profitPercent = (finalA - 1) * 100;
        if (profitPercent >= minProfitPercent) {
          opportunities.push({
            chain: [A, B, A],
            profitPercent,
            startAmount: 1,
            endAmount: finalA,
            steps: [
              { from: A,           to: 'Chaos Orb', rate: sA,       amount: chaosAfterSellA },
              { from: 'Chaos Orb', to: B,           rate: 1 / bB,   amount: unitsB },
              { from: B,           to: 'Chaos Orb', rate: sB,       amount: chaosAfterSellB },
              { from: 'Chaos Orb', to: A,           rate: 1 / bA,   amount: finalA },
            ],
          });
        }
      }
    }

    // 3-step: A → chaos → B → chaos → C → chaos → A (limit iterations for performance)
    const limit = Math.min(currencies.length, 20);
    for (let i = 0; i < limit; i++) {
      const A = currencies[i];
      const sA = sellRate.get(A)!;
      const bA = buyRate.get(A)!;

      for (let j = 0; j < limit; j++) {
        if (j === i) continue;
        const B = currencies[j];
        const sB = sellRate.get(B)!;
        const bB = buyRate.get(B)!;

        for (let k = 0; k < limit; k++) {
          if (k === i || k === j) continue;
          const C = currencies[k];
          const sC = sellRate.get(C)!;
          const bC = buyRate.get(C)!;

          const chaosA  = sA;
          const unitsB  = chaosA  / bB;
          const chaosB  = unitsB  * sB;
          const unitsC  = chaosB  / bC;
          const chaosC  = unitsC  * sC;
          const finalA  = chaosC  / bA;

          const profitPercent = (finalA - 1) * 100;
          if (profitPercent >= minProfitPercent) {
            opportunities.push({
              chain: [A, B, C, A],
              profitPercent,
              startAmount: 1,
              endAmount: finalA,
              steps: [
                { from: A,           to: 'Chaos Orb', rate: sA,     amount: chaosA },
                { from: 'Chaos Orb', to: B,           rate: 1 / bB, amount: unitsB },
                { from: B,           to: 'Chaos Orb', rate: sB,     amount: chaosB },
                { from: 'Chaos Orb', to: C,           rate: 1 / bC, amount: unitsC },
                { from: C,           to: 'Chaos Orb', rate: sC,     amount: chaosC },
                { from: 'Chaos Orb', to: A,           rate: 1 / bA, amount: finalA },
              ],
            });
          }
        }
      }
    }

    opportunities.sort((a, b) => b.profitPercent - a.profitPercent);

    // De-duplicate chains with the same set of currencies
    const seen = new Set<string>();
    const unique = opportunities.filter(opp => {
      const key = [...opp.chain].sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique.slice(0, 20);
  }

  /**
   * Get from cache if not expired
   */
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }
    return null;
  }

  /**
   * Put data in cache
   */
  private putInCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
