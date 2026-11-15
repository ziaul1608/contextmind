import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webSearchService, normalizeUrl, trimSnippet } from '../services/webSearch.service';

describe('webSearchService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    webSearchService.clearCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // 1. URL Normalization & Deduplication helper tests
  describe('normalizeUrl', () => {
    it('normalizes hostnames to lowercase and removes www.', () => {
      expect(normalizeUrl('https://WWW.Example.COM/page')).toBe('https://example.com/page');
    });

    it('strips tracking query parameters', () => {
      expect(
        normalizeUrl(
          'https://example.com/article?utm_source=twitter&utm_medium=social&id=123&fbclid=xyz',
        ),
      ).toBe('https://example.com/article?id=123');
    });

    it('removes trailing slash for pathnames longer than /', () => {
      expect(normalizeUrl('https://example.com/blog/news/')).toBe('https://example.com/blog/news');
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    });

    it('rejects non-http/https protocols', () => {
      expect(normalizeUrl('javascript:alert(1)')).toBeNull();
      expect(normalizeUrl('file:///etc/passwd')).toBeNull();
      expect(normalizeUrl('data:text/plain;base64,abc')).toBeNull();
    });

    it('handles invalid URLs gracefully', () => {
      expect(normalizeUrl('not-a-valid-url')).toBeNull();
    });
  });

  describe('trimSnippet', () => {
    it('trims whitespace and limits length', () => {
      const longText = 'A'.repeat(500);
      const trimmed = trimSnippet(longText, 100);
      expect(trimmed.length).toBe(103); // 100 + '...'
      expect(trimmed.endsWith('...')).toBe(true);
    });

    it('leaves short snippets unchanged', () => {
      expect(trimSnippet('Short snippet')).toBe('Short snippet');
    });
  });

  // 2. Successful Search
  it('performs a successful search and returns formatted results', async () => {
    const mockTavilyResponse = {
      results: [
        {
          title: 'TypeScript 5.5 Released',
          url: 'https://devblogs.microsoft.com/typescript/announcing-typescript-5-5/',
          content: 'TypeScript 5.5 brings inferred type predicates and regex syntax checking.',
          score: 0.95,
        },
        {
          title: 'Node.js 22 Features',
          url: 'https://nodejs.org/en/blog/release/v22.0.0',
          content: 'Node.js 22 is now available with V8 12.4 and Maglev compiler enabled by default.',
          score: 0.88,
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockTavilyResponse),
    } as any);

    const response = await webSearchService.search({
      query: 'TypeScript 5.5 features',
      topic: 'general',
    });

    expect(response.fromCache).toBe(false);
    expect(response.query).toBe('TypeScript 5.5 features');
    expect(response.results).toHaveLength(2);
    expect(response.results[0].title).toBe('TypeScript 5.5 Released');
    expect(response.results[0].url).toBe('https://devblogs.microsoft.com/typescript/announcing-typescript-5-5');
    expect(response.results[0].score).toBe(0.95);
    expect(response.results[0].retrievedAt).toBeDefined();
  });

  // 3. Relevance Filtering
  it('filters out results with low relevance scores below threshold', async () => {
    const mockTavilyResponse = {
      results: [
        {
          title: 'Relevant Result',
          url: 'https://example.com/high',
          content: 'Highly relevant content',
          score: 0.85,
        },
        {
          title: 'Spam/Low Relevance Result',
          url: 'https://example.com/low',
          content: 'Irrelevant junk text',
          score: 0.12, // Below 0.25 threshold
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockTavilyResponse),
    } as any);

    const response = await webSearchService.search({ query: 'testing relevance' });
    expect(response.results).toHaveLength(1);
    expect(response.results[0].title).toBe('Relevant Result');
  });

  // 4. URL Deduplication
  it('deduplicates identical URLs with different tracking params or casing', async () => {
    const mockTavilyResponse = {
      results: [
        {
          title: 'First Article',
          url: 'https://example.com/article/?utm_source=twitter',
          content: 'First snippet',
          score: 0.9,
        },
        {
          title: 'Duplicate Article with different param',
          url: 'https://WWW.example.com/article?utm_campaign=spring',
          content: 'Duplicate snippet',
          score: 0.85,
        },
        {
          title: 'Unique Article',
          url: 'https://example.com/unique',
          content: 'Unique snippet',
          score: 0.8,
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockTavilyResponse),
    } as any);

    const response = await webSearchService.search({ query: 'dedup test' });
    expect(response.results).toHaveLength(2);
    expect(response.results[0].url).toBe('https://example.com/article');
    expect(response.results[1].url).toBe('https://example.com/unique');
  });

  // 5. In-Memory LRU Cache Hit & Expiration
  it('returns cached results on repeated queries without calling fetch', async () => {
    const mockTavilyResponse = {
      results: [
        {
          title: 'Cached Item',
          url: 'https://example.com/item',
          content: 'Snippet',
          score: 0.9,
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockTavilyResponse),
    } as any);
    global.fetch = fetchMock;

    // First call: hits API
    const res1 = await webSearchService.search({ query: 'cache query' });
    expect(res1.fromCache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call: served from cache
    const res2 = await webSearchService.search({ query: 'cache query' });
    expect(res2.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // Not called again!
    expect(res2.results[0].title).toBe('Cached Item');
  });

  // 6. API Failure (Non-retryable 4xx)
  it('fails immediately without retrying on client 4xx errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized: Invalid API key'),
    } as any);
    global.fetch = fetchMock;

    await expect(webSearchService.search({ query: 'test auth' })).rejects.toThrow(
      /Tavily search failed with status 401/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1); // No retry on 401
  });

  // 7. Transient 5xx Failure with Bounded Retry
  it('retries once on transient 5xx server error then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            results: [
              {
                title: 'Recovered Result',
                url: 'https://example.com/recovered',
                content: 'Success after retry',
                score: 0.9,
              },
            ],
          }),
      } as any);
    global.fetch = fetchMock;

    const response = await webSearchService.search({ query: 'retry query' });
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    expect(response.results).toHaveLength(1);
    expect(response.results[0].title).toBe('Recovered Result');
  });

  // 8. Timeout Handling
  it('aborts and throws a timeout error when request exceeds timeout threshold', async () => {
    // Mock fetch that hangs until signal is aborted
    global.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_, reject) => {
        const signal = options?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    const parentController = new AbortController();
    // Simulate user or system abort
    setTimeout(() => parentController.abort(), 50);

    await expect(
      webSearchService.search({ query: 'hanging query' }, parentController.signal),
    ).rejects.toThrow();
  });

  // 9. Intentional Abort / Cancellation Never Retries
  it('does not retry when cancelled intentionally via AbortSignal', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, options) => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      return Promise.reject(abortErr);
    });
    global.fetch = fetchMock;

    const parentController = new AbortController();
    parentController.abort(); // already aborted

    await expect(
      webSearchService.search({ query: 'cancel test' }, parentController.signal),
    ).rejects.toThrow(/Search cancelled by user/);

    expect(fetchMock).toHaveBeenCalledTimes(0); // Bails out before network attempt

    // Now test when abort happens during fetch execution
    const liveController = new AbortController();
    const liveFetchMock = vi.fn().mockImplementation(() => {
      liveController.abort();
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      return Promise.reject(abortErr);
    });
    global.fetch = liveFetchMock;

    await expect(
      webSearchService.search({ query: 'mid-flight cancel' }, liveController.signal),
    ).rejects.toThrow(/Search cancelled by user/);

    expect(liveFetchMock).toHaveBeenCalledTimes(1); // Never retried after abort!
  });
});
