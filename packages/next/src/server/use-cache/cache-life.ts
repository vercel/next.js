import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { validateAndNormalizeCacheLifeProfile } from './cache-life-profile'
import type { CacheLife } from './cache-life-profile'

export type { CacheLife }

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

export function cacheLife(profile: CacheLifeProfiles | CacheLife): void {
  if (!process.env.__NEXT_USE_CACHE) {
    throw new Error(
      '`cacheLife()` is only available with the `cacheComponents` config.'
    )
  }

  const workUnitStore = workUnitAsyncStorage.getStore()

  switch (workUnitStore?.type) {
    case 'prerender':
    case 'prerender-client':
    case 'validation-client':
    case 'prerender-runtime':
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'request':
    case 'unstable-cache':
    case 'generate-static-params':
    case undefined:
      throw new Error(
        '`cacheLife()` can only be called inside a "use cache" function.'
      )
    case 'cache':
    case 'private-cache':
      break
    default:
      workUnitStore satisfies never
  }

  if (typeof profile === 'string') {
    const workStore = workAsyncStorage.getStore()
    if (!workStore) {
      throw new Error(
        '`cacheLife()` can only be called during App Router rendering at the moment.'
      )
    }

    // TODO: This should be globally available and not require an AsyncLocalStorage.
    const configuredProfile = workStore.cacheLifeProfiles[profile]
    if (configuredProfile === undefined) {
      if (workStore.cacheLifeProfiles[profile.trim()]) {
        throw new Error(
          `Unknown \`cacheLife()\` profile "${profile}" is not configured in next.config.js\n` +
            `Did you mean "${profile.trim()}" without the spaces?`
        )
      }
      throw new Error(
        `Unknown \`cacheLife()\` profile "${profile}" is not configured in next.config.js\n` +
          'module.exports = {\n' +
          '  cacheLife: {\n' +
          `    "${profile}": ...\n` +
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
      'Invalid `cacheLife()` option. Either pass a profile name or object.'
    )
  } else {
    profile = validateAndNormalizeCacheLifeProfile(profile, { kind: 'inline' })
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
