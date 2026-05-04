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

type CacheLifeProfileKey = keyof CacheLife

type CacheLifeProfileContext =
  | { kind: 'inline' }
  | { kind: 'config'; profileName: string }

function getCacheLifeFalseError(key: CacheLifeProfileKey): string {
  switch (key) {
    case 'stale':
      return (
        'Pass `Infinity` instead of `false` if you want to cache on the client forever ' +
        'without checking with the server.'
      )
    case 'revalidate':
      return 'Pass `Infinity` instead of `false` if you do not want to revalidate by time.'
    case 'expire':
      return (
        'Pass `Infinity` instead of `false` if you want to cache on the server forever ' +
        'without checking with the origin.'
      )
    default:
      key satisfies never
      throw new Error(`Unknown cacheLife option ${String(key)}`)
  }
}

function getInvalidCacheLifeValueError(
  key: CacheLifeProfileKey,
  value: unknown,
  context: CacheLifeProfileContext
): string {
  if (context.kind === 'config') {
    return `Invalid "cacheLife.${context.profileName}.${key}" provided, expected a finite number of seconds or Infinity, received ${String(
      value
    )}`
  }

  return `Invalid \`cacheLife()\` option "${key}" provided, expected a finite number of seconds or Infinity, received ${String(
    value
  )}.`
}

function getNonNumberCacheLifeValueError(
  key: CacheLifeProfileKey,
  value: unknown,
  context: CacheLifeProfileContext
): string {
  if (context.kind === 'config') {
    return getInvalidCacheLifeValueError(key, value, context)
  }

  return `The ${key} option must be a number of seconds.`
}

function normalizeCacheLifeValue(
  key: CacheLifeProfileKey,
  value: unknown,
  context: CacheLifeProfileContext
): number | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === false) {
    throw new Error(getCacheLifeFalseError(key))
  }

  if (typeof value !== 'number') {
    throw new Error(getNonNumberCacheLifeValueError(key, value, context))
  }

  if (value === Infinity) {
    return INFINITE_CACHE
  }

  if (!Number.isFinite(value)) {
    throw new Error(getInvalidCacheLifeValueError(key, value, context))
  }

  return value
}

export function validateAndNormalizeCacheLifeProfile(
  profile: CacheLife,
  context: CacheLifeProfileContext
): CacheLife {
  if (profile.stale !== undefined) {
    profile.stale = normalizeCacheLifeValue('stale', profile.stale, context)
  }
  if (profile.revalidate !== undefined) {
    profile.revalidate = normalizeCacheLifeValue(
      'revalidate',
      profile.revalidate,
      context
    )
  }
  if (profile.expire !== undefined) {
    profile.expire = normalizeCacheLifeValue('expire', profile.expire, context)
  }

  if (profile.revalidate !== undefined && profile.expire !== undefined) {
    if (profile.revalidate > profile.expire) {
      throw new Error(
        'If providing both the revalidate and expire options, ' +
          'the expire option must be greater than the revalidate option. ' +
          'The expire option indicates how many seconds from the start ' +
          'until it can no longer be used.'
      )
    }
  }

  return profile
}
