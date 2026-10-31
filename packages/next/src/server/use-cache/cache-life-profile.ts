import { INFINITE_CACHE } from '../../lib/constants'

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

type CacheLifeProfileContext =
  | { kind: 'inline' }
  | { kind: 'config'; profileName: string }

function normalizeCacheLifeValue(
  key: keyof CacheLife,
  value: unknown,
  context: CacheLifeProfileContext
): number | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === false) {
    if (key === 'stale') {
      throw new Error(
        'Pass `Infinity` instead of `false` if you want to cache on the client forever ' +
          'without checking with the server.'
      )
    } else if (key === 'revalidate') {
      throw new Error(
        'Pass `Infinity` instead of `false` if you do not want to revalidate by time.'
      )
    } else {
      throw new Error(
        'Pass `Infinity` instead of `false` if you want to cache on the server forever ' +
          'without checking with the origin.'
      )
    }
  }

  if (typeof value !== 'number') {
    throw new Error(`The ${key} option must be a number of seconds.`)
  }

  if (value === Infinity) {
    // Infinity means "never", but turns into null when serialized as JSON
    // (e.g. for build workers or cache handlers), unlike INFINITE_CACHE.
    return INFINITE_CACHE
  }

  if (!Number.isFinite(value)) {
    throw new Error(
      context.kind === 'config'
        ? `Invalid "cacheLife.${context.profileName}.${key}" provided, expected a finite number of seconds or Infinity, received ${value}`
        : `Invalid \`cacheLife()\` option "${key}" provided, expected a finite number of seconds or Infinity, received ${value}.`
    )
  }

  return value
}

export function validateAndNormalizeCacheLifeProfile(
  profile: CacheLife,
  context: CacheLifeProfileContext
): CacheLife {
  // Don't mutate the profile; it may be shared, e.g. as part of the user's
  // config object.
  const normalizedProfile = { ...profile }

  for (const key of ['stale', 'revalidate', 'expire'] as const) {
    const value = normalizeCacheLifeValue(key, profile[key], context)
    if (value !== undefined) {
      normalizedProfile[key] = value
    }
  }

  if (
    normalizedProfile.revalidate !== undefined &&
    normalizedProfile.expire !== undefined &&
    normalizedProfile.revalidate > normalizedProfile.expire
  ) {
    throw new Error(
      'If providing both the revalidate and expire options, ' +
        'the expire option must be greater than the revalidate option. ' +
        'The expire option indicates how many seconds from the start ' +
        'until it can no longer be used.'
    )
  }

  return normalizedProfile
}
