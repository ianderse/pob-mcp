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

    const data = await response.json();
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

    const data = await response.json();
    this.putInCache(cacheKey, data);
    return data;
  }

  /**
   * Build a currency exchange rate map (all rates in chaos equivalent)
   */
  async getCurrencyExchangeMap(league: string): Promise<Map<string, number>> {
    const cacheKey = `currency:${league}`;
    const cached = this.getFromCache(cacheKey);

    const url = `${this.baseUrl}/overview?league=${encodeURIComponent(league)}&type=Currency`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'pob-mcp-server/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`poe.ninja API request failed (${response.status}): ${await response.text()}`);
    }

    const data: NewCurrencyOverview = await response.json();
    this.putInCache(cacheKey, data);

    const rateMap = new Map<string, number>();

    // Chaos is the base currency
    rateMap.set('Chaos Orb', 1.0);

    // Build id->name mapping
    const idToName = new Map<string, string>();
    for (const item of data.items) {
      idToName.set(item.id, item.name);
    }

    // Parse currency rates from new format
    for (const line of data.lines) {
      const name = idToName.get(line.id);
      if (name && line.primaryValue > 0) {
        rateMap.set(name, line.primaryValue);
      }
    }

    return rateMap;
  }

  /**
   * Find arbitrage opportunities using currency exchange rates
   */
  async findArbitrageOpportunities(league: string, minProfitPercent: number = 1.0): Promise<ArbitrageOpportunity[]> {
    const rateMap = await this.getCurrencyExchangeMap(league);
    const opportunities: ArbitrageOpportunity[] = [];

    // Convert to array for easier iteration
    const currencies = Array.from(rateMap.keys());

    // Check 2-step arbitrage (A -> B -> A)
    for (let i = 0; i < currencies.length; i++) {
      const currencyA = currencies[i];
      const rateA = rateMap.get(currencyA)!;

      for (let j = 0; j < currencies.length; j++) {
        if (i === j) continue;

        const currencyB = currencies[j];
        const rateB = rateMap.get(currencyB)!;

        // Calculate round-trip: A -> Chaos -> B -> Chaos -> A
        // Starting with 1 unit of A
        const chaosFromA = rateA;
        const unitsOfB = chaosFromA / rateB;
        const chaosFromB = unitsOfB * rateB;
        const finalA = chaosFromB / rateA;

        const profitPercent = ((finalA - 1) * 100);

        if (profitPercent >= minProfitPercent) {
          opportunities.push({
            chain: [currencyA, currencyB, currencyA],
            profitPercent,
            startAmount: 1,
            endAmount: finalA,
            steps: [
              { from: currencyA, to: 'Chaos Orb', rate: rateA, amount: rateA },
              { from: 'Chaos Orb', to: currencyB, rate: 1 / rateB, amount: unitsOfB },
              { from: currencyB, to: 'Chaos Orb', rate: rateB, amount: chaosFromB },
              { from: 'Chaos Orb', to: currencyA, rate: 1 / rateA, amount: finalA },
            ],
          });
        }
      }
    }

    // Check 3-step arbitrage (A -> B -> C -> A)
    for (let i = 0; i < currencies.length && i < 20; i++) { // Limit for performance
      const currencyA = currencies[i];
      const rateA = rateMap.get(currencyA)!;

      for (let j = 0; j < currencies.length && j < 20; j++) {
        if (i === j) continue;
        const currencyB = currencies[j];
        const rateB = rateMap.get(currencyB)!;

        for (let k = 0; k < currencies.length && k < 20; k++) {
          if (k === i || k === j) continue;
          const currencyC = currencies[k];
          const rateC = rateMap.get(currencyC)!;

          // A -> B -> C -> A
          const chaosFromA = rateA;
          const unitsOfB = chaosFromA / rateB;
          const chaosFromB = unitsOfB * rateB;
          const unitsOfC = chaosFromB / rateC;
          const chaosFromC = unitsOfC * rateC;
          const finalA = chaosFromC / rateA;

          const profitPercent = ((finalA - 1) * 100);

          if (profitPercent >= minProfitPercent) {
            opportunities.push({
              chain: [currencyA, currencyB, currencyC, currencyA],
              profitPercent,
              startAmount: 1,
              endAmount: finalA,
              steps: [
                { from: currencyA, to: 'Chaos Orb', rate: rateA, amount: rateA },
                { from: 'Chaos Orb', to: currencyB, rate: 1 / rateB, amount: unitsOfB },
                { from: currencyB, to: 'Chaos Orb', rate: rateB, amount: chaosFromB },
                { from: 'Chaos Orb', to: currencyC, rate: 1 / rateC, amount: unitsOfC },
                { from: currencyC, to: 'Chaos Orb', rate: rateC, amount: chaosFromC },
                { from: 'Chaos Orb', to: currencyA, rate: 1 / rateA, amount: finalA },
              ],
            });
          }
        }
      }
    }

    // Sort by profit percentage descending
    opportunities.sort((a, b) => b.profitPercent - a.profitPercent);

    // Remove duplicates (same currencies, different order)
    const seen = new Set<string>();
    const unique = opportunities.filter(opp => {
      const key = [...opp.chain].sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique.slice(0, 20); // Return top 20
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
