import path from 'path'
import loadConfig from 'next/dist/server/config'
import { PHASE_PRODUCTION_SERVER } from 'next/constants'

// `loadConfig` caches its result keyed on `dir` + a boolean "hasCustomConfig".
// Each test uses a unique subdirectory so the cache doesn't bleed between
// cases. The subdirectory doesn't need to exist — only the string matters
// for the cache key, and `loadEnvConfig` tolerates missing dirs.
function uniqueDir(tag: string) {
  return path.join(__dirname, `__cache_life_normalization_${tag}__`)
}

// `Infinity` is a documented value for cacheLife fields, but the resolved
// config crosses JSON serialization boundaries (e.g. to build workers), where
// `Infinity` turns into `null`. Config loading normalizes it to a value with
// the same meaning that survives serialization.
describe('cacheLife Infinity normalization', () => {
  it('resolves Infinity revalidate/expire to values that survive JSON serialization', async () => {
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
    const { frozen, max } = config.cacheLife
    expect(JSON.parse(JSON.stringify(frozen))).toEqual(frozen)
    expect(frozen.stale).toBe(300)

    // The resolved values must still mean "never": at least as long-lived as
    // the built-in `max` profile.
    expect(frozen.revalidate).toBeGreaterThanOrEqual(max.expire!)
    expect(frozen.expire).toBeGreaterThanOrEqual(max.expire!)
  })

  it('resolves Infinity stale to a value that survives JSON serialization', async () => {
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
    const { pinned, max } = config.cacheLife
    expect(JSON.parse(JSON.stringify(pinned))).toEqual(pinned)
    expect(pinned.stale).toBeGreaterThanOrEqual(max.expire!)
    expect(pinned.revalidate).toBe(60)
    expect(pinned.expire).toBe(120)
  })

  it('rejects non-finite values other than Infinity', async () => {
    await expect(
      loadConfig(PHASE_PRODUCTION_SERVER, uniqueDir('negative-infinity'), {
        customConfig: {
          cacheLife: {
            invalid: { revalidate: -Infinity },
          },
        },
      })
    ).rejects.toThrow(
      'Invalid "cacheLife.invalid.revalidate" provided, expected a finite number of seconds or Infinity, received -Infinity'
    )
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
    expect(config.cacheLife.brief).toEqual({
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
    const defaultProfile = config.cacheLife.default
    expect(JSON.parse(JSON.stringify(defaultProfile))).toEqual(defaultProfile)
    expect(defaultProfile.revalidate).toBeGreaterThanOrEqual(
      config.cacheLife.max.expire!
    )
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
    const baseline = await loadConfig(
      PHASE_PRODUCTION_SERVER,
      uniqueDir('builtins-baseline'),
      { customConfig: {} }
    )
    expect(config.cacheLife.seconds).toEqual(baseline.cacheLife.seconds)
    expect(config.cacheLife.default).toEqual(baseline.cacheLife.default)
  })
})
