import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'

export type CacheLife = {
  // How long the client can cache a value without checking with the server.
  stale?: number
  // How frequently you want the cache to refresh on the server.
  // Stale values may be served while revalidating.
  revalidate?: number
  // In the worst case scenario, where you haven't had traffic in a while,
  // how stale can a value be until you prefer deopting to dynamic.
  // Must be longer than revalidate.
  expire?: number
}
// The equivalent header is kind of like:
// Cache-Control: max-age=[stale],s-max-age=[revalidate],stale-while-revalidate=[expire-revalidate],stale-if-error=[expire-revalidate]
// Except that stale-while-revalidate/stale-if-error only applies to shared caches - not private caches.

// The default revalidates relatively frequently but doesn't expire to ensure it's always
// able to serve fast results but by default doesn't hang.

// This gets overridden by the next-types-plugin
type CacheLifeProfiles =
  | 'default'
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'days'
  | 'weeks'
  | 'max'
  | (string & {})

function validateCacheLife(profile: CacheLife) {
  if (profile.stale !== undefined) {
    if ((profile.stale as any) === false) {
      throw new Error(
        'Pass `Infinity` instead of `false` if you want to cache on the client forever ' +
          'without checking with the server.'
      )
    } else if (typeof profile.stale !== 'number') {
      throw new Error('The stale option must be a number of seconds.')
    }
  }
  if (profile.revalidate !== undefined) {
    if ((profile.revalidate as any) === false) {
      throw new Error(
        'Pass `Infinity` instead of `false` if you do not want to revalidate by time.'
      )
    } else if (typeof profile.revalidate !== 'number') {
      throw new Error('The revalidate option must be a number of seconds.')
    }
  }
  if (profile.expire !== undefined) {
    if ((profile.expire as any) === false) {
      throw new Error(
        'Pass `Infinity` instead of `false` if you want to cache on the client forever ' +
          'without checking with the server.'
      )
    } else if (typeof profile.expire !== 'number') {
      throw new Error('The expire option must be a number of seconds.')
    }
  }

  if (profile.revalidate !== undefined && profile.expire !== undefined) {
    if (profile.revalidate > profile.expire) {
      throw new Error(
        'If providing both the revalidate and expire options, ' +
          'the expire option must be greater than the revalidate option.' +
          'The expire option indicates how many seconds from the start ' +
          'until it can no longer be used.'
      )
    }
  }

  if (profile.stale !== undefined && profile.expire !== undefined) {
    if (profile.stale > profile.expire) {
      throw new Error(
        'If providing both the stale and expire options, ' +
          'the expire option must be greater than the stale option.' +
          'The expire option indicates how many seconds from the start ' +
          'until it can no longer be used.'
      )
    }
  }
}

export function cacheLife(profile: CacheLifeProfiles | CacheLife): void {
  if (!process.env.__NEXT_USE_CACHE) {
    throw new Error(
      'cacheLife() is only available with the experimental.useCache config.'
    )
  }

  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!workUnitStore || workUnitStore.type !== 'cache') {
    throw new Error(
      'cacheLife() can only be called inside a "use cache" function.'
    )
  }

  if (typeof profile === 'string') {
    const workStore = workAsyncStorage.getStore()
    if (!workStore) {
      throw new Error(
        'cacheLife() can only be called during App Router rendering at the moment.'
      )
    }
    if (!workStore.cacheLifeProfiles) {
      throw new Error(
        'cacheLifeProfiles should always be provided. This is a bug in Next.js.'
      )
    }

    // TODO: This should be globally available and not require an AsyncLocalStorage.
    const configuredProfile = workStore.cacheLifeProfiles[profile]
    if (configuredProfile === undefined) {
      if (workStore.cacheLifeProfiles[profile.trim()]) {
        throw new Error(
          `Unknown cacheLife profile "${profile}" is not configured in next.config.js\n` +
            `Did you mean "${profile.trim()}" without the spaces?`
        )
      }
      throw new Error(
        `Unknown cacheLife profile "${profile}" is not configured in next.config.js\n` +
          'module.exports = {\n' +
          '  experimental: {\n' +
          '    cacheLife: {\n' +
          `      "${profile}": ...\n` +
          '    }\n' +
          '  }\n' +
          '}'
      )
    }
    profile = configuredProfile
  } else if (
    typeof profile !== 'object' ||
    profile === null ||
    Array.isArray(profile)
  ) {
    throw new Error(
      'Invalid cacheLife() option. Either pass a profile name or object.'
    )
  } else {
    validateCacheLife(profile)
  }

  if (profile.revalidate !== undefined) {
    // Track the explicit revalidate time.
    if (
      workUnitStore.explicitRevalidate === undefined ||
      workUnitStore.explicitRevalidate > profile.revalidate
    ) {
      workUnitStore.explicitRevalidate = profile.revalidate
    }
  }
  if (profile.expire !== undefined) {
    // Track the explicit expire time.
    if (
      workUnitStore.explicitExpire === undefined ||
      workUnitStore.explicitExpire > profile.expire
    ) {
      workUnitStore.explicitExpire = profile.expire
    }
  }
  if (profile.stale !== undefined) {
    // Track the explicit stale time.
    if (
      workUnitStore.explicitStale === undefined ||
      workUnitStore.explicitStale > profile.stale
    ) {
      workUnitStore.explicitStale = profile.stale
    }
  }
}
