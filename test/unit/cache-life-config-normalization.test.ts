import path from 'path'
import loadConfig from 'next/dist/server/config'
import { PHASE_PRODUCTION_SERVER } from 'next/constants'
import { INFINITE_CACHE } from 'next/dist/lib/constants'

// `loadConfig` caches its result keyed on `dir` + a boolean "hasCustomConfig".
// Each test uses a unique subdirectory so the cache doesn't bleed between
// cases. The subdirectory doesn't need to exist — only the string matters
// for the cache key, and `loadEnvConfig` tolerates missing dirs.
function uniqueDir(tag: string) {
  return path.join(__dirname, `__cache_life_normalization_${tag}__`)
}

// `Infinity` is a documented value for cacheLife fields, but the resolved
// config crosses JSON serialization boundaries (e.g. to build workers), where
// `Infinity` turns into `null`. Config loading normalizes it to
// `INFINITE_CACHE`, which has the same meaning and survives serialization.
describe('cacheLife Infinity normalization', () => {
  it('normalizes Infinity revalidate/expire to INFINITE_CACHE and keeps finite stale', async () => {
    const config = await loadConfig(
      PHASE_PRODUCTION_SERVER,
      uniqueDir('custom-infinity'),
      {
        customConfig: {
          cacheLife: {
            frozen: { stale: 300, revalidate: Infinity, expire: Infinity },
          },
        },
      }
    )
    expect(config.cacheLife?.frozen).toEqual({
      stale: 300,
      revalidate: INFINITE_CACHE,
      expire: INFINITE_CACHE,
    })
  })

  it('normalizes Infinity stale to INFINITE_CACHE', async () => {
    const config = await loadConfig(
      PHASE_PRODUCTION_SERVER,
      uniqueDir('stale-infinity'),
      {
        customConfig: {
          cacheLife: {
            pinned: { stale: Infinity, revalidate: 60, expire: 120 },
          },
        },
      }
    )
    expect(config.cacheLife?.pinned).toEqual({
      stale: INFINITE_CACHE,
      revalidate: 60,
      expire: 120,
    })
  })

  it('does not mutate the profile objects of the provided config', async () => {
    const frozen = { stale: 300, revalidate: Infinity, expire: Infinity }
    await loadConfig(PHASE_PRODUCTION_SERVER, uniqueDir('no-mutation'), {
      customConfig: { cacheLife: { frozen } },
    })
    expect(frozen).toEqual({
      stale: 300,
      revalidate: Infinity,
      expire: Infinity,
    })
  })

  it('passes finite values through unchanged', async () => {
    const config = await loadConfig(
      PHASE_PRODUCTION_SERVER,
      uniqueDir('finite'),
      {
        customConfig: {
          cacheLife: {
            brief: { stale: 10, revalidate: 20, expire: 30 },
          },
        },
      }
    )
    expect(config.cacheLife?.brief).toEqual({
      stale: 10,
      revalidate: 20,
      expire: 30,
    })
  })

  it('normalizes Infinity in an overridden default profile', async () => {
    const config = await loadConfig(
      PHASE_PRODUCTION_SERVER,
      uniqueDir('default-infinity'),
      {
        customConfig: {
          cacheLife: {
            default: { stale: 300, revalidate: Infinity, expire: Infinity },
          },
        },
      }
    )
    expect(config.cacheLife?.default).toEqual({
      stale: 300,
      revalidate: INFINITE_CACHE,
      expire: INFINITE_CACHE,
    })
  })

  it('leaves the built-in profiles unchanged when only a custom profile is configured', async () => {
    const config = await loadConfig(
      PHASE_PRODUCTION_SERVER,
      uniqueDir('builtins'),
      {
        customConfig: {
          cacheLife: {
            frozen: { stale: 300, revalidate: Infinity, expire: Infinity },
          },
        },
      }
    )
    expect(config.cacheLife?.seconds).toEqual({
      stale: 30,
      revalidate: 1,
      expire: 60,
    })
    expect(config.cacheLife?.default.revalidate).toBe(900)
    expect(config.cacheLife?.default.expire).toBe(INFINITE_CACHE)
  })
})
