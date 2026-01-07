import type { CacheLife } from '../../use-cache/cache-life'
import fs from 'fs'
import path from 'path'

const MINUTE_IN_SECONDS = 60
const HOUR_IN_SECONDS = MINUTE_IN_SECONDS * 60 // nevermind leap seconds
const DAY_IN_SECONDS = HOUR_IN_SECONDS * 24
const WEEK_IN_SECONDS = DAY_IN_SECONDS * 7
// Nevermind leap years, or you know, July
const MONTH_30_DAYS_IN_SECONDS = DAY_IN_SECONDS * 30

function formatTimespan(seconds: number): string {
  if (seconds > 0) {
    if (seconds === MONTH_30_DAYS_IN_SECONDS) {
      return '1 month'
    }
    if (seconds === WEEK_IN_SECONDS) {
      return '1 week'
    }
    if (seconds === DAY_IN_SECONDS) {
      return '1 day'
    }
    if (seconds === HOUR_IN_SECONDS) {
      return '1 hour'
    }
    if (seconds === MINUTE_IN_SECONDS) {
      return '1 minute'
    }
    if (seconds % MONTH_30_DAYS_IN_SECONDS === 0) {
      return seconds / MONTH_30_DAYS_IN_SECONDS + ' months'
    }
    if (seconds % 18144000 === 0) {
      return seconds / 18144000 + ' months'
    }
    if (seconds % WEEK_IN_SECONDS === 0) {
      return seconds / WEEK_IN_SECONDS + ' weeks'
    }
    if (seconds % DAY_IN_SECONDS === 0) {
      return seconds / DAY_IN_SECONDS + ' days'
    }
    if (seconds % HOUR_IN_SECONDS === 0) {
      return seconds / HOUR_IN_SECONDS + ' hours'
    }
    if (seconds % MINUTE_IN_SECONDS === 0) {
      return seconds / MINUTE_IN_SECONDS + ' minutes'
    }
  }
  return seconds + ' seconds'
}

function formatTimespanWithSeconds(seconds: undefined | number): string {
  if (seconds === undefined) {
    return 'default'
  }
  if (seconds >= 0xfffffffe) {
    return 'never'
  }
  const text = seconds + ' seconds'
  const descriptive = formatTimespan(seconds)
  if (descriptive === text) {
    return text
  }
  return text + ' (' + descriptive + ')'
}

/**
 * Generates TypeScript type definitions for custom cacheLife profiles.
 * This creates overloaded function signatures for the cacheLife() function
 * that provide autocomplete and documentation for each profile.
 */
export function generateCacheLifeTypes(cacheLife: {
  [profile: string]: CacheLife
}): string {
  let overloads = ''

  const profileNames = Object.keys(cacheLife)
  for (let i = 0; i < profileNames.length; i++) {
    const profileName = profileNames[i]
    const profile = cacheLife[profileName]
    if (typeof profile !== 'object' || profile === null) {
      continue
    }

    let description = ''

    if (profile.stale === undefined) {
      description += `
     * This cache may be stale on clients for the default stale time of the scope before checking with the server.`
    } else if (profile.stale >= 0xfffffffe) {
      description += `
     * This cache may be stale on clients indefinitely before checking with the server.`
    } else {
      description += `
     * This cache may be stale on clients for ${formatTimespan(profile.stale)} before checking with the server.`
    }
    if (
      profile.revalidate !== undefined &&
      profile.expire !== undefined &&
      profile.revalidate >= profile.expire
    ) {
      description += `
     * This cache will expire after ${formatTimespan(profile.expire)}. The next request will recompute it.`
    } else {
      if (profile.revalidate === undefined) {
        description += `
     * It will inherit the default revalidate time of its scope since it does not define its own.`
      } else if (profile.revalidate >= 0xfffffffe) {
        // Nothing to mention.
      } else {
        description += `
     * If the server receives a new request after ${formatTimespan(profile.revalidate)}, start revalidating new values in the background.`
      }
      if (profile.expire === undefined) {
        description += `
     * It will inherit the default expiration time of its scope since it does not define its own.`
      } else if (profile.expire >= 0xfffffffe) {
        description += `
     * It lives for the maximum age of the server cache. If this entry has no traffic for a while, it may serve an old value the next request.`
      } else {
        description += `
     * If this entry has no traffic for ${formatTimespan(profile.expire)} it will expire. The next request will recompute it.`
      }
    }

    overloads += `
    /**
     * Cache this \`"use cache"\` for a timespan defined by the \`${JSON.stringify(profileName)}\` profile.
     * \`\`\`
     *   stale:      ${formatTimespanWithSeconds(profile.stale)}
     *   revalidate: ${formatTimespanWithSeconds(profile.revalidate)}
     *   expire:     ${formatTimespanWithSeconds(profile.expire)}
     * \`\`\`
     * ${description}
     */
    export function cacheLife(profile: ${JSON.stringify(profileName)}): void
    `
  }

  overloads += `
    /**
     * Cache this \`"use cache"\` using a custom timespan.
     * \`\`\`
     *   stale: ... // seconds
     *   revalidate: ... // seconds
     *   expire: ... // seconds
     * \`\`\`
     *
     * This is similar to Cache-Control: max-age=\`stale\`,s-max-age=\`revalidate\`,stale-while-revalidate=\`expire-revalidate\`
     *
     * If a value is left out, the lowest of other cacheLife() calls or the default, is used instead.
     */
    export function cacheLife(profile: {
      /**
       * This cache may be stale on clients for ... seconds before checking with the server.
       */
      stale?: number,
      /**
       * If the server receives a new request after ... seconds, start revalidating new values in the background.
       */
      revalidate?: number,
      /**
       * If this entry has no traffic for ... seconds it will expire. The next request will recompute it.
       */
      expire?: number
    }): void
  `

  // Redefine the cacheLife() accepted arguments.
  return `// Type definitions for Next.js cacheLife configs

declare module 'next/cache' {
  export { unstable_cache } from 'next/dist/server/web/spec-extension/unstable-cache'
  export {
    updateTag,
    revalidateTag,
    revalidatePath,
    refresh,
  } from 'next/dist/server/web/spec-extension/revalidate'
  export { unstable_noStore } from 'next/dist/server/web/spec-extension/unstable-no-store'

  ${overloads}

  import { cacheTag } from 'next/dist/server/use-cache/cache-tag'
  export { cacheTag }

  export const unstable_cacheTag: typeof cacheTag
  export const unstable_cacheLife: typeof cacheLife
}
`
}

/**
 * Writes cache-life type definitions to a file if cacheLifeConfig exists.
 * This is used by both the CLI (next type-gen) and dev server to generate
 * cache-life.d.ts in the types directory.
 */
export function writeCacheLifeTypes(
  cacheLifeConfig: undefined | { [profile: string]: CacheLife },
  filePath: string
) {
  if (!cacheLifeConfig || Object.keys(cacheLifeConfig).length === 0) {
    return
  }

  const dirname = path.dirname(filePath)

  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true })
  }

  const content = generateCacheLifeTypes(cacheLifeConfig)
  fs.writeFileSync(filePath, content)
}
