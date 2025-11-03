import Bottleneck from 'bottleneck';
import {
  TradeQuery,
  SearchResult,
  FetchResult,
  StatData,
  LeagueData,
  RateLimitInfo,
  CacheEntry,
  ItemListing,
} from '../types/tradeTypes.js';

/**
 * Client for interacting with the Path of Exile Trade API
 *
 * Features:
 * - Rate limiting (4 requests/second conservative estimate)
 * - Response caching with TTL
 * - Automatic retry with exponential backoff
 * - Rate limit header parsing
 */
export class TradeApiClient {
  private readonly baseUrl = 'https://www.pathofexile.com/api/trade';
  private readonly limiter: Bottleneck;
  private readonly cache = new Map<string, CacheEntry<any>>();
  private readonly defaultCacheTTL: number;
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(options?: {
    requestsPerSecond?: number;
    cacheTTL?: number;
  }) {
    const requestsPerSecond = options?.requestsPerSecond || 4;
    this.defaultCacheTTL = (options?.cacheTTL || 300) * 1000; // Convert to ms

    // Create rate limiter using token bucket algorithm
    this.limiter = new Bottleneck({
      reservoir: requestsPerSecond * 2, // Initial tokens
      reservoirRefreshAmount: requestsPerSecond,
      reservoirRefreshInterval: 1000, // Refill every second
      maxConcurrent: 1, // One request at a time
      minTime: Math.floor(1000 / requestsPerSecond), // Minimum time between requests
    });

    // Set up event handlers for better observability
    this.limiter.on('failed', async (error, jobInfo) => {
      const retryAfter = this.rateLimitInfo?.retryAfter;
      if (retryAfter && jobInfo.retryCount < 3) {
        console.error(`[TradeAPI] Request failed, retrying after ${retryAfter}ms (attempt ${jobInfo.retryCount + 1}/3)`);
        return retryAfter;
      }
    });

    this.limiter.on('retry', (error, jobInfo) => {
      console.error(`[TradeAPI] Retrying request (attempt ${jobInfo.retryCount + 1})`);
    });
  }

  /**
   * Search for items matching the given query
   */
  async searchItems(league: string, query: TradeQuery): Promise<SearchResult> {
    const cacheKey = `search:${league}:${JSON.stringify(query)}`;
    const cached = this.getFromCache<SearchResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `${this.baseUrl}/search/${encodeURIComponent(league)}`;
    const result = await this.limiter.schedule(() =>
      this.makeRequest<SearchResult>('POST', url, query)
    );

    this.putInCache(cacheKey, result, this.defaultCacheTTL);
    return result;
  }

  /**
   * Fetch full item details for the given item IDs
   * Can fetch up to 10 items at once
   */
  async fetchItems(itemIds: string[], queryId?: string): Promise<ItemListing[]> {
    if (itemIds.length === 0) {
      return [];
    }

    if (itemIds.length > 10) {
      throw new Error('Cannot fetch more than 10 items at once');
    }

    const cacheKey = `fetch:${itemIds.join(',')}`;
    const cached = this.getFromCache<ItemListing[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const idsParam = itemIds.join(',');
    const url = queryId
      ? `${this.baseUrl}/fetch/${idsParam}?query=${queryId}`
      : `${this.baseUrl}/fetch/${idsParam}`;

    const result = await this.limiter.schedule(() =>
      this.makeRequest<FetchResult>('GET', url)
    );

    const items = result.result || [];
    this.putInCache(cacheKey, items, this.defaultCacheTTL);
    return items;
  }

  /**
   * Get available stat filters from the API
   * This data changes infrequently, so we cache it for 1 hour
   */
  async getStats(): Promise<StatData> {
    const cacheKey = 'stats:all';
    const cached = this.getFromCache<StatData>(cacheKey, 3600000); // 1 hour
    if (cached) {
      return cached;
    }

    const url = `${this.baseUrl}/data/stats`;
    const result = await this.limiter.schedule(() =>
      this.makeRequest<StatData>('GET', url)
    );

    this.putInCache(cacheKey, result, 3600000); // Cache for 1 hour
    return result;
  }

  /**
   * Get available leagues
   * This data changes infrequently, so we cache it for 1 hour
   */
  async getLeagues(): Promise<LeagueData> {
    const cacheKey = 'leagues:all';
    const cached = this.getFromCache<LeagueData>(cacheKey, 3600000); // 1 hour
    if (cached) {
      return cached;
    }

    const url = `${this.baseUrl}/data/leagues`;
    const result = await this.limiter.schedule(() =>
      this.makeRequest<LeagueData>('GET', url)
    );

    this.putInCache(cacheKey, result, 3600000); // Cache for 1 hour
    return result;
  }

  /**
   * Get current rate limit information
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear specific cache entries matching a pattern
   */
  clearCachePattern(pattern: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  // ========================================
  // Private Methods
  // ========================================

  private async makeRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    body?: any
  ): Promise<T> {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'pob-mcp-server/1.0',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    // Parse rate limit headers
    this.updateRateLimitInfo(response);

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10) * 1000;
      this.rateLimitInfo = {
        limit: this.rateLimitInfo?.limit || 0,
        remaining: 0,
        retryAfter,
      };
      throw new Error(`Rate limited. Retry after ${retryAfter}ms`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Trade API request failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  private updateRateLimitInfo(response: Response): void {
    const limitHeader = response.headers.get('X-Rate-Limit-Ip');
    const stateHeader = response.headers.get('X-Rate-Limit-Ip-State');
    const retryAfterHeader = response.headers.get('Retry-After');

    if (limitHeader && stateHeader) {
      // Parse format: "limit:max:period"
      const [, maxRequests] = limitHeader.split(':').map(Number);
      // Parse format: "current:max:period"
      const [current] = stateHeader.split(':').map(Number);

      this.rateLimitInfo = {
        limit: maxRequests || 0,
        remaining: Math.max(0, (maxRequests || 0) - (current || 0)),
        retryAfter: retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : undefined,
      };
    }
  }

  private getFromCache<T>(key: string, customTTL?: number): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private putInCache<T>(key: string, data: T, ttl: number): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl,
    });
  }
}
