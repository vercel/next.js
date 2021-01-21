import React from 'react';

export class ApolloCacheControl {
  cacheInstances = new Map();
  storedExtractedCache = new Map();

  static context
  
  static getContext() {
    if (!ApolloCacheControl.context) {
      ApolloCacheControl.context = React.createContext(null);
    }

    return ApolloCacheControl.context;
  }

  registerCache(key, cache) {
    if (this.cacheInstances.has(key)) {
      const extractedCache = this.extractCache(key);
      if (extractedCache) {
        this.cacheInstances.set(key, cache.restore(extractedCache));
      }
      return;
    }
    this.cacheInstances.set(key, cache);
  }

  extractCache(key) {
    const cache = this.cacheInstances.get(key);
    if (cache) {
      return cache.extract();
    }

    return null;
  }

  getExtractedCache(key) {
    return this.storedExtractedCache.get(key);
  }

  getSnapshot() {
    const allCacheExtracts = {};
    this.cacheInstances.forEach((value, key) => {
      allCacheExtracts[key] = value.extract();
    });
    return allCacheExtracts;
  }

  restoreSnapshot(snapshot) {
    for (const key in snapshot) {
      this.storedExtractedCache.set(key, snapshot[key]);
    }
  }

  seal() {
    this.cacheInstances.clear();
    this.storedExtractedCache.clear();
  }
}
