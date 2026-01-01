/**
 * Server-side In-Memory Cache
 * Ultra-fast response caching for API endpoints
 */

import { Context, Next } from 'hono';

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

class MemoryCache {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private maxSize: number = 1000; // Maximum number of entries

    /**
     * Get cached data
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * Set cached data
     */
    set<T>(key: string, data: T, ttlMs: number = 60000): void {
        // Evict oldest entries if cache is full
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttlMs
        });
    }

    /**
     * Delete cached data
     */
    delete(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Clear all cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache stats
     */
    stats(): { size: number; maxSize: number } {
        return {
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }

    /**
     * Clean expired entries (call periodically)
     */
    cleanExpired(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
            }
        }
    }
}

// Singleton instance
export const serverCache = new MemoryCache();

// TTL constants (in milliseconds)
export const CACHE_TTL = {
    MODULES: 5 * 60 * 1000,      // 5 minutes for homepage modules
    SEARCH: 10 * 60 * 1000,      // 10 minutes for search results
    ARTIST: 30 * 60 * 1000,      // 30 minutes for artist data
    ALBUM: 30 * 60 * 1000,       // 30 minutes for album data
    SONG: 60 * 60 * 1000,        // 1 hour for song data (rarely changes)
    TRENDING: 5 * 60 * 1000,     // 5 minutes for trending
    LYRICS: 24 * 60 * 60 * 1000, // 24 hours for lyrics
};

/**
 * Helper function to create cache key from request
 */
export const createCacheKey = (prefix: string, params: Record<string, any>): string => {
    const sortedParams = Object.keys(params)
        .sort()
        .map(k => `${k}=${params[k]}`)
        .join('&');
    return `${prefix}:${sortedParams}`;
};

/**
 * Hono-compatible cache middleware factory
 * Usage: app.get('/endpoint', honoCache('prefix', CACHE_TTL.SEARCH), handler)
 */
export const honoCache = (prefix: string, ttl: number) => {
    return async (c: Context, next: Next) => {
        const url = new URL(c.req.url);
        const params = Object.fromEntries(url.searchParams.entries());
        const cacheKey = createCacheKey(prefix, { path: url.pathname, ...params });

        const cached = serverCache.get(cacheKey);

        if (cached) {
            // Return cached response with cache hit header
            return c.json(cached);
        }

        // Continue to handler
        await next();

        // After handler completes, cache the response if it was successful
        // Note: This requires the handler to use ctx.set('cacheData', data) pattern
        const responseData = c.get('cacheData');
        if (responseData && responseData.success !== false) {
            serverCache.set(cacheKey, responseData, ttl);
        }
    };
};

/**
 * Simple wrapper for controllers to cache responses
 */
export const withCache = async <T>(
    key: string,
    ttl: number,
    fetcher: () => Promise<T>
): Promise<T> => {
    const cached = serverCache.get<T>(key);
    if (cached) return cached;

    const data = await fetcher();
    if (data && (data as any).success !== false) {
        serverCache.set(key, data, ttl);
    }
    return data;
};

/**
 * Cache middleware factory
 * Usage: app.get('/endpoint', cacheMiddleware('prefix', CACHE_TTL.SEARCH), handler)
 */
export const cacheMiddleware = (prefix: string, ttl: number) => {
    return (req: any, res: any, next: any) => {
        const cacheKey = createCacheKey(prefix, { ...req.params, ...req.query });
        const cached = serverCache.get(cacheKey);

        if (cached) {
            return res.json(cached);
        }

        // Store original json method
        const originalJson = res.json.bind(res);

        // Override json to cache successful responses
        res.json = (data: any) => {
            if (data && data.success !== false) {
                serverCache.set(cacheKey, data, ttl);
            }
            return originalJson(data);
        };

        next();
    };
};

// Clean expired entries every 5 minutes
setInterval(() => {
    serverCache.cleanExpired();
}, 5 * 60 * 1000);

export default serverCache;
