import { env } from '../config/env';

export interface SearchOptions {
  query: string;
  topic?: 'general' | 'news' | 'finance';
  time_range?: 'day' | 'week' | 'month' | 'year';
  max_results?: number;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  score: number;
  retrievedAt: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
  fromCache: boolean;
  durationMs: number;
}

interface CacheEntry {
  response: SearchResponse;
  expiresAt: number;
}

const TAVILY_API_URL = 'https://api.tavily.com/search';
const DEFAULT_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 100;
const MAX_SNIPPET_LENGTH = 350;
const MIN_RELEVANCE_SCORE = 0.25;

// In-memory LRU Cache with TTL
class SearchCache {
  private cache = new Map<string, CacheEntry>();

  get(key: string): SearchResponse | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Refresh position for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);

    return {
      ...entry.response,
      fromCache: true,
    };
  }

  set(key: string, response: SearchResponse): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      // Remove oldest (first inserted in Map iterator)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      response,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

const searchCache = new SearchCache();

/**
 * Normalizes a URL for comparison and deduplication:
 * - Checks protocol (only http and https)
 * - Lowercases hostname and removes 'www.'
 * - Removes common tracking query parameters
 * - Removes trailing slash
 */
export function normalizeUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // Strip common tracking parameters
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'ref',
      'fbclid',
      'gclid',
      'msclkid',
      'mc_cid',
      'mc_eid',
    ];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }

    // Strip hash
    parsed.hash = '';

    // Strip trailing slash if pathname is more than '/'
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Trims snippet cleanly to max length
 */
export function trimSnippet(snippet: string, maxLength: number = MAX_SNIPPET_LENGTH): string {
  const cleaned = snippet.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return cleaned.slice(0, maxLength).trimEnd() + '...';
}

function getApiKey(): string {
  const key = env.TAVILY_API_KEY || process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error('TAVILY_API_KEY is not configured. Set it in your environment.');
  }
  return key;
}

export const webSearchService = {
  isConfigured(): boolean {
    return Boolean(env.TAVILY_API_KEY || process.env.TAVILY_API_KEY);
  },

  /**
   * Clears the in-memory cache (primarily for tests).
   */
  clearCache(): void {
    searchCache.clear();
  },

  /**
   * Executes a web search with timeout, 1-bounded retry on transient errors,
   * URL normalization, deduplication, relevance filtering, and LRU caching.
   */
  async search(options: SearchOptions, parentSignal?: AbortSignal): Promise<SearchResponse> {
    const query = options.query.trim();
    if (!query) {
      return { query: '', results: [], fromCache: false, durationMs: 0 };
    }

    const topic = options.topic || 'general';
    const timeRange = options.time_range;
    const maxResults = options.max_results ?? 5;
    const searchDepth = env.TAVILY_SEARCH_DEPTH || 'basic';

    const cacheKey = `${topic}:${timeRange || 'any'}:${query.toLowerCase()}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const apiKey = getApiKey();
    const startTime = Date.now();

    const requestPayload = {
      api_key: apiKey,
      query,
      search_depth: searchDepth,
      topic,
      ...(timeRange ? { time_range: timeRange } : {}),
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    };

    // Execute with one retry on transient failure
    let lastError: Error | null = null;
    let rawData: any = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      if (parentSignal?.aborted) {
        const abortErr = new Error('Search cancelled by user');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), DEFAULT_TIMEOUT_MS);

      // Link parent abort signal if provided
      const abortHandler = () => timeoutController.abort();
      if (parentSignal) {
        parentSignal.addEventListener('abort', abortHandler, { once: true });
      }

      try {
        const response = await fetch(TAVILY_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
          signal: timeoutController.signal,
        });

        clearTimeout(timeoutId);
        if (parentSignal) {
          parentSignal.removeEventListener('abort', abortHandler);
        }

        if (!response.ok) {
          const status = response.status;
          const errorText = await response.text().catch(() => '');

          // Do NOT retry client errors (4xx) like bad request, unauthorized, rate limit
          if (status >= 400 && status < 500) {
            throw new Error(`Tavily search failed with status ${status}: ${errorText.slice(0, 100)}`);
          }

          // 5xx error: eligible for 1 retry
          throw new Error(`Tavily server error ${status}: ${errorText.slice(0, 100)}`);
        }

        rawData = await response.json();
        break; // Success!
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (parentSignal) {
          parentSignal.removeEventListener('abort', abortHandler);
        }

        const isParentAbort = Boolean(parentSignal?.aborted);
        const isAbortError = err instanceof Error && err.name === 'AbortError';
        const isTimeout =
          timeoutController.signal.aborted && !isParentAbort && !isAbortError;

        let error: Error;
        if (isTimeout) {
          error = new Error(`Tavily search request timed out after ${DEFAULT_TIMEOUT_MS}ms`);
        } else if (isParentAbort || isAbortError) {
          error = new Error('Search cancelled by user');
          error.name = 'AbortError';
        } else if (err instanceof Error) {
          error = err;
        } else {
          error = new Error(String(err));
        }

        lastError = error;

        // If parent signal was aborted or intentional AbortError, never retry!
        if (isParentAbort || isAbortError || error.name === 'AbortError') {
          throw error;
        }

        // Only retry once on transient server or network error
        if (attempt === 1 && (isTimeout || error.message.includes('server error') || error.message.includes('fetch failed'))) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }

        throw error;
      }
    }

    if (!rawData || !Array.isArray(rawData.results)) {
      if (lastError) throw lastError;
      throw new Error('Invalid response structure received from Tavily API');
    }

    // Process, normalize, deduplicate, filter, and trim results
    const seenUrls = new Set<string>();
    const results: SearchResultItem[] = [];
    const retrievedAt = new Date().toISOString();

    for (const rawItem of rawData.results) {
      if (!rawItem || typeof rawItem !== 'object') continue;

      const title = String(rawItem.title || '').trim() || 'Untitled Source';
      const rawUrl = String(rawItem.url || '').trim();
      const rawSnippet = String(rawItem.content || rawItem.snippet || '').trim();
      const score = typeof rawItem.score === 'number' ? rawItem.score : 0.5;

      // Filter low relevance
      if (score < MIN_RELEVANCE_SCORE) {
        continue;
      }

      // Normalize and validate URL
      const normalized = normalizeUrl(rawUrl);
      if (!normalized) {
        continue;
      }

      // Deduplicate
      if (seenUrls.has(normalized)) {
        continue;
      }
      seenUrls.add(normalized);

      results.push({
        title,
        url: normalized,
        snippet: trimSnippet(rawSnippet),
        score: Math.min(Math.max(score, 0), 1),
        retrievedAt,
      });

      if (results.length >= maxResults) {
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    const finalResponse: SearchResponse = {
      query,
      results,
      fromCache: false,
      durationMs,
    };

    // Cache valid results
    searchCache.set(cacheKey, finalResponse);

    return finalResponse;
  },
};
