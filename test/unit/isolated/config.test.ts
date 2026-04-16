/* eslint-env jest */
import { join } from 'path'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

const pathToConfig = join(__dirname, '_resolvedata', 'without-function')
const pathToConfigFn = join(__dirname, '_resolvedata', 'with-function')

// force require usage instead of dynamic import in jest
// x-ref: https://github.com/nodejs/node/issues/35889
process.env.__NEXT_TEST_MODE = 'jest'

describe('config', () => {
  let loadConfig: typeof import('next/dist/server/config').default

  beforeEach(async () => {
    // Reset the module cache to ensure each test gets a fresh config load
    // This is important because config.ts now has a module-level configCache
    jest.resetModules()

    // Dynamically import the module after reset to get a fresh instance
    const configModule = await import('next/dist/server/config')
    loadConfig = configModule.default
  })
  it('Should get the configuration', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfig)
    expect((config as any).customConfig).toBe(true)
  })

  it('Should pass the phase correctly', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfigFn)
    expect((config as any).phase).toBe(PHASE_DEVELOPMENT_SERVER)
  })

  it('Should pass the defaultConfig correctly', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfigFn)
    expect((config as any).defaultConfig).toBeDefined()
  })

  it('Should assign object defaults deeply to user config', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, pathToConfigFn)
    expect(config.distDir.replace(/\\/g, '/')).toEqual('.next/dev')
    expect(config.onDemandEntries.maxInactiveAge).toBeDefined()
  })

  it('Should pass the customConfig correctly', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>', {
      customConfig: {
        customConfigKey: 'customConfigValue',
      },
    })
    expect((config as any).customConfigKey).toBe('customConfigValue')
  })

  it('Should assign object defaults deeply to customConfig', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>', {
      customConfig: {
        customConfig: true,
        onDemandEntries: { custom: true },
      },
    })
    expect((config as any).customConfig).toBe(true)
    expect(config.onDemandEntries.maxInactiveAge).toBeDefined()
  })

  it('Should allow setting objects which do not have defaults', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>', {
      customConfig: {
        bogusSetting: { custom: true },
      },
    })
    expect((config as any).bogusSetting).toBeDefined()
    expect((config as any).bogusSetting.custom).toBe(true)
  })

  it('Should override defaults for arrays from user arrays', async () => {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>', {
      customConfig: {
        pageExtensions: ['.bogus'],
      },
    })
    expect(config.pageExtensions).toEqual(['.bogus'])
  })

  it('Should throw when an invalid target is provided', async () => {
    await expect(async () => {
      await loadConfig(
        PHASE_DEVELOPMENT_SERVER,
        join(__dirname, '_resolvedata', 'invalid-target')
      )
    }).rejects.toThrow(/The "target" property is no longer supported/)
  })

  it('Should throw an error when next.config.(js | mjs | ts) is not present', async () => {
    await expect(
      async () =>
        await loadConfig(
          PHASE_DEVELOPMENT_SERVER,
          join(__dirname, '_resolvedata', 'missing-config')
        )
    ).rejects.toThrow(
      /Configuring Next.js via .+ is not supported. Please replace the file with 'next.config.js'/
    )
  })

  it('Should throw an error when sassOptions.functions is used with Turbopack', async () => {
    const originalTurbopack = process.env.TURBOPACK
    process.env.TURBOPACK = '1'

    try {
      await expect(async () => {
        // Use a unique directory to avoid cache conflicts
        await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>-turbopack-test', {
          customConfig: {
            sassOptions: {
              functions: {
                'get($keys)': function (keys) {
                  return 'test'
                },
              },
            },
          },
        })
      }).rejects.toThrow(
        /The "sassOptions\.functions" option is not supported when using Turbopack/
      )
    } finally {
      if (originalTurbopack === undefined) {
        delete process.env.TURBOPACK
      } else {
        process.env.TURBOPACK = originalTurbopack
      }
    }
  })

  it('Should allow sassOptions.functions when not using Turbopack', async () => {
    const originalTurbopack = process.env.TURBOPACK
    delete process.env.TURBOPACK

    try {
      const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>', {
        customConfig: {
          sassOptions: {
            functions: {
              'get($keys)': function (keys) {
                return 'test'
              },
            },
          },
        },
      })
      expect((config as any).sassOptions.functions).toBeDefined()
    } finally {
      if (originalTurbopack !== undefined) {
        process.env.TURBOPACK = originalTurbopack
      }
    }
  })

  it('Should not throw an error when two versions of next.config.js are present', async () => {
    const config = await loadConfig(
      PHASE_DEVELOPMENT_SERVER,
      join(__dirname, '_resolvedata', 'js-ts-config')
    )
    expect((config as any).__test__ext).toBe('js')
  })

  it('Should not throw an error when next.config.ts is present', async () => {
    const config = await loadConfig(
      PHASE_DEVELOPMENT_SERVER,
      join(__dirname, '_resolvedata', 'typescript-config')
    )
    expect((config as any).__test__ext).toBe('ts')
  })

  describe('outputFileTracingRoot and turbopack.root consistency', () => {
    it('Should set both outputFileTracingRoot and turbopack.root to the same value when only outputFileTracingRoot is provided', async () => {
      const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>', {
        customConfig: {
          outputFileTracingRoot: '/custom/root',
        },
      })
      expect(config.outputFileTracingRoot).toBe('/custom/root')
      expect(config.turbopack.root).toBe('/custom/root')
    })

    it('Should set both outputFileTracingRoot and turbopack.root to the same value when only turbopack.root is provided', async () => {
      const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>', {
        customConfig: {
          turbopack: { root: '/custom/root' },
        },
      })
      expect(config.outputFileTracingRoot).toBe('/custom/root')
      expect(config.turbopack.root).toBe('/custom/root')
    })

    it('Should use outputFileTracingRoot value when both are provided with different values', async () => {
      const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>', {
        customConfig: {
          outputFileTracingRoot: '/tracing/root',
          turbopack: { root: '/turbo/root' },
        },
      })
      expect(config.outputFileTracingRoot).toBe('/tracing/root')
      expect(config.turbopack.root).toBe('/tracing/root')
    })

    it('Should keep the same value when both are provided with matching values', async () => {
      const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>', {
        customConfig: {
          outputFileTracingRoot: '/same/root',
          turbopack: { root: '/same/root' },
        },
      })
      expect(config.outputFileTracingRoot).toBe('/same/root')
      expect(config.turbopack.root).toBe('/same/root')
    })

    it('Should set both to findRootDir result when neither is provided', async () => {
      const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>', {
        customConfig: {},
      })
      expect(config.outputFileTracingRoot).toBeDefined()
      expect(config.turbopack.root).toBe(config.outputFileTracingRoot)
    })
  })
})
