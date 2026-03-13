import { generateCacheLifeTypes } from './cache-life-type-utils'

describe('cache-life-type-utils', () => {
  it('should generate cache-life types with custom profiles', () => {
    const cacheLifeConfig = {
      default: {
        stale: 3600,
        revalidate: 900,
        expire: 86400,
      },
      hours: {
        stale: 300,
        revalidate: 3600,
        expire: 7200,
      },
    }

    const output = generateCacheLifeTypes(cacheLifeConfig)

    expect(output).toMatchInlineSnapshot(`
     "// Type definitions for Next.js cacheLife configs

     declare module 'next/cache' {
       export { unstable_cache } from 'next/dist/server/web/spec-extension/unstable-cache'
       export {
         updateTag,
         revalidateTag,
         revalidatePath,
         refresh,
       } from 'next/dist/server/web/spec-extension/revalidate'
       export { unstable_noStore } from 'next/dist/server/web/spec-extension/unstable-no-store'

       
         /**
          * Cache this \`"use cache"\` for a timespan defined by the \`"default"\` profile.
          * \`\`\`
          *   stale:      3600 seconds (1 hour)
          *   revalidate: 900 seconds (15 minutes)
          *   expire:     86400 seconds (1 day)
          * \`\`\`
          * 
          * This cache may be stale on clients for 1 hour before checking with the server.
          * If the server receives a new request after 15 minutes, start revalidating new values in the background.
          * If this entry has no traffic for 1 day it will expire. The next request will recompute it.
          */
         export function cacheLife(profile: "default"): void
         
         /**
          * Cache this \`"use cache"\` for a timespan defined by the \`"hours"\` profile.
          * \`\`\`
          *   stale:      300 seconds (5 minutes)
          *   revalidate: 3600 seconds (1 hour)
          *   expire:     7200 seconds (2 hours)
          * \`\`\`
          * 
          * This cache may be stale on clients for 5 minutes before checking with the server.
          * If the server receives a new request after 1 hour, start revalidating new values in the background.
          * If this entry has no traffic for 2 hours it will expire. The next request will recompute it.
          */
         export function cacheLife(profile: "hours"): void
         
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
       

       import { cacheTag } from 'next/dist/server/use-cache/cache-tag'
       export { cacheTag }

       export const unstable_cacheTag: typeof cacheTag
       export const unstable_cacheLife: typeof cacheLife
     }
     "
    `)
  })

  it('should format time periods correctly', () => {
    const cacheLifeConfig = {
      seconds: {
        stale: 30,
        revalidate: 45,
        expire: 90,
      },
      minutes: {
        stale: 60,
        revalidate: 300,
        expire: 600,
      },
      hours: {
        stale: 3600,
        revalidate: 7200,
        expire: 10800,
      },
      days: {
        stale: 86400,
        revalidate: 172800,
        expire: 259200,
      },
      weeks: {
        stale: 604800,
        revalidate: 1209600,
        expire: 1814400,
      },
      months: {
        stale: 30 * 24 * 60 * 60,
        revalidate: 2 * 30 * 24 * 60 * 60,
        expire: 4 * 30 * 24 * 60 * 60,
      },
    }

    const output = generateCacheLifeTypes(cacheLifeConfig)
    // Filter to just the timeformatting lines
    const justConfigLines = output
      .split('\n')
      .filter((line) => /stale:|revalidate:|expire:/.test(line))
      .join('\n')

    expect(justConfigLines).toMatchInlineSnapshot(`
     "     *   stale:      30 seconds
          *   revalidate: 45 seconds
          *   expire:     90 seconds
          *   stale:      60 seconds (1 minute)
          *   revalidate: 300 seconds (5 minutes)
          *   expire:     600 seconds (10 minutes)
          *   stale:      3600 seconds (1 hour)
          *   revalidate: 7200 seconds (2 hours)
          *   expire:     10800 seconds (3 hours)
          *   stale:      86400 seconds (1 day)
          *   revalidate: 172800 seconds (2 days)
          *   expire:     259200 seconds (3 days)
          *   stale:      604800 seconds (1 week)
          *   revalidate: 1209600 seconds (2 weeks)
          *   expire:     1814400 seconds (3 weeks)
          *   stale:      2592000 seconds (1 month)
          *   revalidate: 5184000 seconds (2 months)
          *   expire:     10368000 seconds (4 months)
          *   stale: ... // seconds
          *   revalidate: ... // seconds
          *   expire: ... // seconds"
    `)
  })

  it('should handle undefined values correctly', () => {
    const cacheLifeConfig = {
      partial: {
        stale: undefined,
        revalidate: 3600,
        expire: undefined,
      },
    }

    const output = generateCacheLifeTypes(cacheLifeConfig)

    expect(output).toMatchInlineSnapshot(`
     "// Type definitions for Next.js cacheLife configs

     declare module 'next/cache' {
       export { unstable_cache } from 'next/dist/server/web/spec-extension/unstable-cache'
       export {
         updateTag,
         revalidateTag,
         revalidatePath,
         refresh,
       } from 'next/dist/server/web/spec-extension/revalidate'
       export { unstable_noStore } from 'next/dist/server/web/spec-extension/unstable-no-store'

       
         /**
          * Cache this \`"use cache"\` for a timespan defined by the \`"partial"\` profile.
          * \`\`\`
          *   stale:      default
          *   revalidate: 3600 seconds (1 hour)
          *   expire:     default
          * \`\`\`
          * 
          * This cache may be stale on clients for the default stale time of the scope before checking with the server.
          * If the server receives a new request after 1 hour, start revalidating new values in the background.
          * It will inherit the default expiration time of its scope since it does not define its own.
          */
         export function cacheLife(profile: "partial"): void
         
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
       

       import { cacheTag } from 'next/dist/server/use-cache/cache-tag'
       export { cacheTag }

       export const unstable_cacheTag: typeof cacheTag
       export const unstable_cacheLife: typeof cacheLife
     }
     "
    `)
  })

  it('should handle "never" values correctly', () => {
    const cacheLifeConfig = {
      infinite: {
        stale: 0xfffffffe,
        revalidate: 0xfffffffe,
        expire: 0xfffffffe,
      },
    }

    const output = generateCacheLifeTypes(cacheLifeConfig)

    expect(output).toMatchInlineSnapshot(`
     "// Type definitions for Next.js cacheLife configs

     declare module 'next/cache' {
       export { unstable_cache } from 'next/dist/server/web/spec-extension/unstable-cache'
       export {
         updateTag,
         revalidateTag,
         revalidatePath,
         refresh,
       } from 'next/dist/server/web/spec-extension/revalidate'
       export { unstable_noStore } from 'next/dist/server/web/spec-extension/unstable-no-store'

       
         /**
          * Cache this \`"use cache"\` for a timespan defined by the \`"infinite"\` profile.
          * \`\`\`
          *   stale:      never
          *   revalidate: never
          *   expire:     never
          * \`\`\`
          * 
          * This cache may be stale on clients indefinitely before checking with the server.
          * This cache will expire after 4294967294 seconds. The next request will recompute it.
          */
         export function cacheLife(profile: "infinite"): void
         
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
       

       import { cacheTag } from 'next/dist/server/use-cache/cache-tag'
       export { cacheTag }

       export const unstable_cacheTag: typeof cacheTag
       export const unstable_cacheLife: typeof cacheLife
     }
     "
    `)
  })

  it('should include base cacheLife function signature', () => {
    const cacheLifeConfig = {
      custom: {
        stale: 100,
        revalidate: 200,
        expire: 300,
      },
    }

    const output = generateCacheLifeTypes(cacheLifeConfig)

    expect(output).toMatchInlineSnapshot(`
     "// Type definitions for Next.js cacheLife configs

     declare module 'next/cache' {
       export { unstable_cache } from 'next/dist/server/web/spec-extension/unstable-cache'
       export {
         updateTag,
         revalidateTag,
         revalidatePath,
         refresh,
       } from 'next/dist/server/web/spec-extension/revalidate'
       export { unstable_noStore } from 'next/dist/server/web/spec-extension/unstable-no-store'

       
         /**
          * Cache this \`"use cache"\` for a timespan defined by the \`"custom"\` profile.
          * \`\`\`
          *   stale:      100 seconds
          *   revalidate: 200 seconds
          *   expire:     300 seconds (5 minutes)
          * \`\`\`
          * 
          * This cache may be stale on clients for 100 seconds before checking with the server.
          * If the server receives a new request after 200 seconds, start revalidating new values in the background.
          * If this entry has no traffic for 5 minutes it will expire. The next request will recompute it.
          */
         export function cacheLife(profile: "custom"): void
         
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
       

       import { cacheTag } from 'next/dist/server/use-cache/cache-tag'
       export { cacheTag }

       export const unstable_cacheTag: typeof cacheTag
       export const unstable_cacheLife: typeof cacheLife
     }
     "
    `)
  })

  it('should include module exports', () => {
    const cacheLifeConfig = {
      test: {
        stale: 100,
        revalidate: 200,
        expire: 300,
      },
    }

    const output = generateCacheLifeTypes(cacheLifeConfig)

    expect(output).toMatchInlineSnapshot(`
     "// Type definitions for Next.js cacheLife configs

     declare module 'next/cache' {
       export { unstable_cache } from 'next/dist/server/web/spec-extension/unstable-cache'
       export {
         updateTag,
         revalidateTag,
         revalidatePath,
         refresh,
       } from 'next/dist/server/web/spec-extension/revalidate'
       export { unstable_noStore } from 'next/dist/server/web/spec-extension/unstable-no-store'

       
         /**
          * Cache this \`"use cache"\` for a timespan defined by the \`"test"\` profile.
          * \`\`\`
          *   stale:      100 seconds
          *   revalidate: 200 seconds
          *   expire:     300 seconds (5 minutes)
          * \`\`\`
          * 
          * This cache may be stale on clients for 100 seconds before checking with the server.
          * If the server receives a new request after 200 seconds, start revalidating new values in the background.
          * If this entry has no traffic for 5 minutes it will expire. The next request will recompute it.
          */
         export function cacheLife(profile: "test"): void
         
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
       

       import { cacheTag } from 'next/dist/server/use-cache/cache-tag'
       export { cacheTag }

       export const unstable_cacheTag: typeof cacheTag
       export const unstable_cacheLife: typeof cacheLife
     }
     "
    `)
  })

  it('should skip non-object profile values', () => {
    const cacheLifeConfig = {
      valid: {
        stale: 100,
        revalidate: 200,
        expire: 300,
      },
      invalid1: null,
      invalid2: 'string',
      invalid3: 123,
    }

    // @ts-expect-error
    const output = generateCacheLifeTypes(cacheLifeConfig)

    expect(output).toMatchInlineSnapshot(`
     "// Type definitions for Next.js cacheLife configs

     declare module 'next/cache' {
       export { unstable_cache } from 'next/dist/server/web/spec-extension/unstable-cache'
       export {
         updateTag,
         revalidateTag,
         revalidatePath,
         refresh,
       } from 'next/dist/server/web/spec-extension/revalidate'
       export { unstable_noStore } from 'next/dist/server/web/spec-extension/unstable-no-store'

       
         /**
          * Cache this \`"use cache"\` for a timespan defined by the \`"valid"\` profile.
          * \`\`\`
          *   stale:      100 seconds
          *   revalidate: 200 seconds
          *   expire:     300 seconds (5 minutes)
          * \`\`\`
          * 
          * This cache may be stale on clients for 100 seconds before checking with the server.
          * If the server receives a new request after 200 seconds, start revalidating new values in the background.
          * If this entry has no traffic for 5 minutes it will expire. The next request will recompute it.
          */
         export function cacheLife(profile: "valid"): void
         
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
       

       import { cacheTag } from 'next/dist/server/use-cache/cache-tag'
       export { cacheTag }

       export const unstable_cacheTag: typeof cacheTag
       export const unstable_cacheLife: typeof cacheLife
     }
     "
    `)
  })
})
