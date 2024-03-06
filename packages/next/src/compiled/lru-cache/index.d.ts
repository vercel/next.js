// Type definitions for lru-cache 5.1
// Project: https://github.com/isaacs/node-lru-cache
// Definitions by: Bart van der Schoor <https://github.com/Bartvds>
//                 BendingBender <https://github.com/BendingBender>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.3

declare class LRUCache<K, V> {
    constructor(options?: LRUCache.Options<K, V>);
    constructor(max: number);

    /**
     * Return total length of objects in cache taking into account `length` options function.
     */
    readonly length: number;

    /**
     * Return total quantity of objects currently in cache. Note,
     * that `stale` (see options) items are returned as part of this item count.
     */
    readonly itemCount: number;

    /**
     * Same as Options.allowStale.
     */
    allowStale: boolean;

    /**
     * Same as Options.length.
     */
    lengthCalculator(value: V): number;

    /**
     * Same as Options.max. Resizes the cache when the `max` changes.
     */
    max: number;

    /**
     * Same as Options.maxAge. Resizes the cache when the `maxAge` changes.
     */
    maxAge: number;

    /**
     * Will update the "recently used"-ness of the key. They do what you think.
     * `maxAge` is optional and overrides the cache `maxAge` option if provided.
     */
    set(key: K, value: V, maxAge?: number): boolean;

    /**
     * Will update the "recently used"-ness of the key. They do what you think.
     * `maxAge` is optional and overrides the cache `maxAge` option if provided.
     *
     * If the key is not found, will return `undefined`.
     */
    get(key: K): V | undefined;

    /**
     * Returns the key value (or `undefined` if not found) without updating
     * the "recently used"-ness of the key.
     *
     * (If you find yourself using this a lot, you might be using the wrong
     * sort of data structure, but there are some use cases where it's handy.)
     */
    peek(key: K): V | undefined;

    /**
     * Check if a key is in the cache, without updating the recent-ness
     * or deleting it for being stale.
     */
    has(key: K): boolean;

    /**
     * Deletes a key out of the cache.
     */
    del(key: K): void;

    /**
     * Clear the cache entirely, throwing away all values.
     */
    reset(): void;

    /**
     * Manually iterates over the entire cache proactively pruning old entries.
     */
    prune(): void;

    /**
     * Just like `Array.prototype.forEach`. Iterates over all the keys in the cache,
     * in order of recent-ness. (Ie, more recently used items are iterated over first.)
     */
    forEach<T = this>(callbackFn: (this: T, value: V, key: K, cache: this) => void, thisArg?: T): void;

    /**
     * The same as `cache.forEach(...)` but items are iterated over in reverse order.
     * (ie, less recently used items are iterated over first.)
     */
    rforEach<T = this>(callbackFn: (this: T, value: V, key: K, cache: this) => void, thisArg?: T): void;

    /**
     * Return an array of the keys in the cache.
     */
    keys(): K[];

    /**
     * Return an array of the values in the cache.
     */
    values(): V[];

    /**
     * Return an array of the cache entries ready for serialization and usage with `destinationCache.load(arr)`.
     */
    dump(): Array<LRUCache.Entry<K, V>>;

    /**
     * Loads another cache entries array, obtained with `sourceCache.dump()`,
     * into the cache. The destination cache is reset before loading new entries
     *
     * @param cacheEntries Obtained from `sourceCache.dump()`
     */
    load(cacheEntries: ReadonlyArray<LRUCache.Entry<K, V>>): void;
}

declare namespace LRUCache {
    interface Options<K, V> {
        /**
         * The maximum size of the cache, checked by applying the length
         * function to all values in the cache. Not setting this is kind of silly,
         * since that's the whole purpose of this lib, but it defaults to `Infinity`.
         */
        max?: number;

        /**
         * Maximum age in ms. Items are not pro-actively pruned out as they age,
         * but if you try to get an item that is too old, it'll drop it and return
         * undefined instead of giving it to you.
         */
        maxAge?: number;

        /**
         * Function that is used to calculate the length of stored items.
         * If you're storing strings or buffers, then you probably want to do
         * something like `function(n, key){return n.length}`. The default
         * is `function(){return 1}`, which is fine if you want to store
         * `max` like-sized things. The item is passed as the first argument,
         * and the key is passed as the second argument.
         */
        length?(value: V, key?: K): number;

        /**
         * Function that is called on items when they are dropped from the cache.
         * This can be handy if you want to close file descriptors or do other
         * cleanup tasks when items are no longer accessible. Called with `key, value`.
         * It's called before actually removing the item from the internal cache,
         * so if you want to immediately put it back in, you'll have to do that in
         * a `nextTick` or `setTimeout` callback or it won't do anything.
         */
        dispose?(key: K, value: V): void;

        /**
         * By default, if you set a `maxAge`, it'll only actually pull stale items
         * out of the cache when you `get(key)`. (That is, it's not pre-emptively
         * doing a `setTimeout` or anything.) If you set `stale:true`, it'll return
         * the stale value before deleting it. If you don't set this, then it'll
         * return `undefined` when you try to get a stale entry,
         * as if it had already been deleted.
         */
        stale?: boolean;

        /**
         * By default, if you set a `dispose()` method, then it'll be called whenever
         * a `set()` operation overwrites an existing key. If you set this option,
         * `dispose()` will only be called when a key falls out of the cache,
         * not when it is overwritten.
         */
        noDisposeOnSet?: boolean;

        /**
         * When using time-expiring entries with `maxAge`, setting this to `true` will make each
         * item's effective time update to the current time whenever it is retrieved from cache,
         * causing it to not expire. (It can still fall out of cache based on recency of use, of
         * course.)
         */
        updateAgeOnGet?: boolean;
    }

    interface Entry<K, V> {
        k: K;
        v: V;
        e: number;
    }
}

export = LRUCache;
