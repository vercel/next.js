import path from 'path'
import loadConfig from 'next/dist/server/config'
import { PHASE_PRODUCTION_SERVER } from 'next/constants'

// `loadConfig` caches its result keyed on `dir` + a boolean "hasCustomConfig".
// Each test uses a unique subdirectory so the cache doesn't bleed between
// cases. The subdirectory doesn't need to exist — only the string matters
// for the cache key, and `loadEnvConfig` tolerates missing dirs.
function uniqueDir(tag: string) {
  return path.join(__dirname, `__instant_normalization_${tag}__`)
}

// Covers the `finalizeConfig` step in loadConfig: resolving
// `experimental.instant.defaultValidationLevel` to a concrete value in one
// place so consumers don't each need to know the current framework default.
describe('experimental.instant defaultValidationLevel normalization', () => {
  it('defaults to disabled when the instant config is absent', async () => {
    const config = await loadConfig(
      PHASE_PRODUCTION_SERVER,
      uniqueDir('absent'),
      {
        customConfig: {},
      }
    )
    expect(config.experimental.instant).toEqual({
      defaultValidationLevel: 'disabled',
    })
  })

  it('defaults to disabled when experimental.instant is an empty object', async () => {
    const config = await loadConfig(
      PHASE_PRODUCTION_SERVER,
      uniqueDir('empty'),
      {
        customConfig: { experimental: { instant: {} } },
      }
    )
    expect(config.experimental.instant).toEqual({
      defaultValidationLevel: 'disabled',
    })
  })

  it.each(['disabled', 'warning', 'error'] as const)(
    'preserves explicit defaultValidationLevel: %s',
    async (level) => {
      const config = await loadConfig(
        PHASE_PRODUCTION_SERVER,
        uniqueDir(`level-${level}`),
        {
          customConfig: {
            experimental: { instant: { defaultValidationLevel: level } },
          },
        }
      )
      expect(config.experimental.instant).toEqual({
        defaultValidationLevel: level,
      })
    }
  )
})
