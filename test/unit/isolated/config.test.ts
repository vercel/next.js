/* eslint-env jest */
import { join } from 'path'
import { PHASE_DEVELOPMENT_SERVER, PHASE_TEST } from 'next/constants'

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

  it('Should enable the TypeScript CLI by default and allow opting out', async () => {
    const defaultConfig = await loadConfig(
      PHASE_DEVELOPMENT_SERVER,
      '<rootDir>-typescript-cli-default',
      { customConfig: {} }
    )
    expect(defaultConfig.experimental.useTypeScriptCli).toBe(true)

    const apiConfig = await loadConfig(
      PHASE_DEVELOPMENT_SERVER,
      '<rootDir>-typescript-api',
      {
        customConfig: {
          experimental: {
            useTypeScriptCli: false,
          },
        },
      }
    )
    expect(apiConfig.experimental.useTypeScriptCli).toBe(false)
  })

  it('Should configure the development memory threshold opt-out', async () => {
    const defaultConfig = await loadConfig(
      PHASE_DEVELOPMENT_SERVER,
      '<rootDir>-memory-threshold-default',
      {
        customConfig: {},
      }
    )
    expect(defaultConfig.experimental.devMemoryThresholdRestart).toBe(true)

    const disabledConfig = await loadConfig(
      PHASE_DEVELOPMENT_SERVER,
      '<rootDir>-memory-threshold-disabled',
      {
        customConfig: {
          experimental: {
            devMemoryThresholdRestart: false,
          },
        },
      }
    )
    expect(disabledConfig.experimental.devMemoryThresholdRestart).toBe(false)
  })

  it.each([undefined, true, false])(
    'Should preserve imgOptMozjpeg=%s in the runtime config',
    async (imgOptMozjpeg) => {
      const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>', {
        customConfig: {
          experimental: {
            imgOptMozjpeg,
            runtimeServerDeploymentId: true,
          },
        },
      })
      const { getNextConfigRuntime } = await import(
        'next/dist/server/config-shared'
      )
      expect(config.experimental.imgOptMozjpeg).toBe(imgOptMozjpeg ?? true)
      expect(getNextConfigRuntime(config).experimental.imgOptMozjpeg).toBe(
        imgOptMozjpeg ?? true
      )
    }
  )

  it('Should allow bundler-specific options during the test phase', async () => {
    const config = await loadConfig(PHASE_TEST, '<rootDir>-test-phase', {
      customConfig: {
        reactCompiler: true,
        experimental: {
          cssChunking: 'graph',
          turbopackRustReactCompiler: true,
        },
      },
    })

    expect(config.experimental.cssChunking).toBe('graph')
    expect(config.experimental.turbopackRustReactCompiler).toBe(true)
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

  describe('partialPrefetching config', () => {
    it('Should throw when `partialPrefetching` is set without `cacheComponents`', async () => {
      await expect(async () => {
        await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>-no-cc', {
          customConfig: {
            partialPrefetching: true,
          },
        })
      }).rejects.toThrow(
        /`partialPrefetching` requires `cacheComponents` to be enabled/
      )
    })

    it('Should accept `partialPrefetching: true` when `cacheComponents` is enabled', async () => {
      const config = await loadConfig(
        PHASE_DEVELOPMENT_SERVER,
        '<rootDir>-cc',
        {
          customConfig: {
            cacheComponents: true,
            partialPrefetching: true,
          },
        }
      )
      expect(config.partialPrefetching).toBe(true)
    })
  })

  describe('experimental.useCache config', () => {
    it('Should throw when `useCache` is disabled while `cacheComponents` is enabled', async () => {
      await expect(async () => {
        await loadConfig(PHASE_DEVELOPMENT_SERVER, '<rootDir>-uc-conflict', {
          customConfig: {
            cacheComponents: true,
            experimental: { useCache: false },
          },
        })
      }).rejects.toThrow(
        /`experimental.useCache` cannot be disabled when `cacheComponents` is enabled/
      )
    })

    it('Should accept `useCache: false` when `cacheComponents` is not enabled', async () => {
      const config = await loadConfig(
        PHASE_DEVELOPMENT_SERVER,
        '<rootDir>-uc-off',
        {
          customConfig: {
            experimental: { useCache: false },
          },
        }
      )
      expect(config.experimental.useCache).toBe(false)
    })

    it('Should backfill `useCache` from `cacheComponents` when it is not set', async () => {
      const config = await loadConfig(
        PHASE_DEVELOPMENT_SERVER,
        '<rootDir>-uc-backfill',
        {
          customConfig: {
            cacheComponents: true,
          },
        }
      )
      expect(config.experimental.useCache).toBe(true)
    })
  })
})

// Additive refusal-only controls. Existing config cases above remain literal.
describe('default-only testing configuration policy', () => {
  const policy = () =>
    require('next/dist/server/config-testing-policy') as typeof import('next/dist/server/config-testing-policy')
  const names = [
    'NODE_OPTIONS',
    'NODE_PATH',
    '__INTERNAL_CUSTOM_TURBOPACK_BINDINGS',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    'NEXT_TEST_WASM',
    'NEXT_TEST_WASM_DIR',
    'NEXT_DISABLE_SWC_WASM',
    'NEXT_MINIMAL',
    'NEXT_RSPACK',
    'NEXT_PRIVATE_LOCAL_WEBPACK',
    '__NEXT_PRIVATE_STANDALONE_CONFIG',
    '__NEXT_PRIVATE_RENDER_WORKER',
    'BROWSERSLIST',
    'BROWSERSLIST_CONFIG',
    'BROWSERSLIST_ENV',
    'BROWSERSLIST_DANGEROUS_EXTEND',
    'BROWSERSLIST_ROOT_PATH',
    'BROWSERSLIST_STATS',
    'NEXT_RUNTIME',
  ]
  let saved: Map<string, string | undefined>
  let root: string
  let project: string
  beforeEach(async () => {
    const fs = require('fs/promises') as typeof import('fs/promises')
    saved = new Map(names.map((name) => [name, process.env[name]]))
    for (const name of names) delete process.env[name]
    root = await fs.mkdtemp(
      join(require('os').tmpdir(), 'next-default-policy-')
    )
    project = join(root, 'project')
    await fs.cp(
      join(__dirname, '_resolvedata/default-policy137/default-project'),
      project,
      { recursive: true }
    )
    jest.resetModules()
  })
  afterEach(async () => {
    try {
      await require('fs/promises').rm(root, { recursive: true, force: true })
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
  })
  it('keeps absence and an own undefined request absent, and captures a requested scalar', () => {
    const read = policy().readTestingDefaultConfiguration
    expect(read({})).toBeUndefined()
    expect(read({ testingDefaultConfiguration: undefined })).toBeUndefined()
    expect(read({ testingDefaultConfiguration: 'default-only' })).toBe(
      'default-only'
    )
    expect(() => read({ testingDefaultConfiguration: true })).toThrow(
      /unknown refusal policy/
    )
  })
  it('refuses policy accessors, inherited and nonenumerable policy without evaluation', () => {
    let calls = 0
    const read = policy().readTestingDefaultConfiguration
    expect(() =>
      read(
        Object.defineProperty({}, 'testingDefaultConfiguration', {
          enumerable: true,
          get() {
            calls++
            return 'default-only'
          },
        })
      )
    ).toThrow(/enumerable data/)
    expect(() =>
      read(Object.create({ testingDefaultConfiguration: 'default-only' }))
    ).toThrow(/own data/)
    expect(() =>
      read(
        Object.defineProperty({}, 'testingDefaultConfiguration', {
          value: 'default-only',
        })
      )
    ).toThrow(/enumerable data/)
    expect(calls).toBe(0)
  })
  it('snapshots requested option data and refuses getters/unknown keys before use', () => {
    let calls = 0
    const capture = policy().captureTestingDefaultLoadOptions
    const original = {
      testingDefaultConfiguration: 'default-only',
      silent: true,
    }
    const captured = capture(original)
    original.silent = false
    expect(captured.silent).toBe(true)
    expect(Object.isFrozen(captured)).toBe(true)
    expect(() =>
      capture({ testingDefaultConfiguration: 'default-only', unknown: true })
    ).toThrow(/unknown load option/)
    expect(() =>
      capture(
        Object.defineProperty({}, 'silent', {
          enumerable: true,
          get() {
            calls++
            return false
          },
        })
      )
    ).toThrow(/enumerable data/)
    expect(calls).toBe(0)
  })
  it.each(names.filter((name) => name !== 'NEXT_RUNTIME'))(
    'refuses current selector presence: %s',
    (name) => {
      process.env[name] = ''
      expect(() =>
        policy().assertTestingDefaultConfigurationEnvironment('default-only')
      ).toThrow('unsupported environment selector: ' + name)
      expect(() =>
        policy().assertTestingDefaultConfigurationEnvironment(undefined)
      ).not.toThrow()
    }
  )
  it('allows only the Node runtime selector and refuses edge', () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    expect(() =>
      policy().assertTestingDefaultConfigurationEnvironment('default-only')
    ).not.toThrow()
    process.env.NEXT_RUNTIME = 'edge'
    expect(() =>
      policy().assertTestingDefaultConfigurationEnvironment('default-only')
    ).toThrow(/NEXT_RUNTIME/)
  })
  it('refuses actual adapter data/inheritance/accessors without reading an accessor', () => {
    let calls = 0
    const check = policy().assertTestingDefaultConfigurationAdapter
    expect(() => check({}, 'default-only')).not.toThrow()
    expect(() =>
      check({ adapterPath: undefined }, 'default-only')
    ).not.toThrow()
    expect(() =>
      check({ adapterPath: '/unavailable-adapter' }, 'default-only')
    ).toThrow(/adapters are unavailable/)
    expect(() =>
      check(Object.create({ adapterPath: undefined }), 'default-only')
    ).toThrow(/adapters are unavailable/)
    const getter = Object.defineProperty({}, 'adapterPath', {
      get() {
        calls++
        return '/unavailable-adapter'
      },
    })
    expect(() => check(getter, 'default-only')).toThrow(
      /adapters are unavailable/
    )
    expect(() => check(getter, undefined)).not.toThrow()
    expect(calls).toBe(0)
  })
  it('refuses unsupported actual loader options before invoking their accessors or callback', async () => {
    const load = require('next/dist/server/config')
      .default as typeof import('next/dist/server/config').default
    const phase = require('next/constants').PHASE_PRODUCTION_BUILD
    let calls = 0
    for (const extra of [
      { customConfig: {} },
      { rawConfig: true },
      { silent: false },
      {
        reportExperimentalFeatures() {
          calls++
        },
      },
    ]) {
      await expect(
        load(phase, project, {
          testingDefaultConfiguration: 'default-only',
          ...extra,
        })
      ).rejects.toThrow(/unsupported default-only load options/)
    }
    const options = Object.defineProperty(
      { testingDefaultConfiguration: 'default-only' },
      'customConfig',
      {
        enumerable: true,
        get() {
          calls++
          return {}
        },
      }
    )
    await expect(load(phase, project, options as any)).rejects.toThrow(
      /enumerable data/
    )
    expect(calls).toBe(0)
  })
  it('refuses an actual populated ordinary config cache instead of adopting it', async () => {
    const load = require('next/dist/server/config')
      .default as typeof import('next/dist/server/config').default
    const phase = require('next/constants').PHASE_PRODUCTION_BUILD
    const ordinary = await load(phase, project)
    expect(await load(phase, project)).toBe(ordinary)
    await expect(
      load(phase, project, { testingDefaultConfiguration: 'default-only' })
    ).rejects.toThrow(/existing config cache is unavailable/)
    expect(await load(phase, project)).toBe(ordinary)
  })
  it('rejects the selected named config before any code in it can be evaluated', async () => {
    const fs = require('fs/promises') as typeof import('fs/promises')
    await fs.copyFile(
      join(
        __dirname,
        '_resolvedata/default-policy137/named-project/next.config.mjs'
      ),
      join(project, 'next.config.mjs')
    )
    const load = require('next/dist/server/config')
      .default as typeof import('next/dist/server/config').default
    await expect(
      load(require('next/constants').PHASE_PRODUCTION_BUILD, project, {
        testingDefaultConfiguration: 'default-only',
      })
    ).rejects.toThrow(/named Next configuration is unavailable/)
    await expect(
      fs.stat(join(project, 'named-evaluated'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('uses the default target without querying/rescanning after an absent data selection', () => {
    const resolver = jest.fn(() => {
      throw new Error('query resolver must not run')
    })
    const selected = jest.fn(() => undefined)
    Object.assign(resolver, { loadConfig: selected })
    jest.doMock('next/dist/compiled/browserslist', () => ({
      __esModule: true,
      default: resolver,
    }))
    try {
      jest.isolateModules(() => {
        const actual =
          require('next/dist/build/get-supported-browsers').getSupportedBrowsers
        const target =
          require('next/dist/shared/lib/constants').MODERN_BROWSERSLIST_TARGET
        expect(actual(project, false, 'default-only')).toBe(target)
      })
      expect(selected).toHaveBeenCalledTimes(1)
      expect(selected).toHaveBeenCalledWith({
        path: project,
        env: 'production',
      })
      expect(resolver).not.toHaveBeenCalled()
    } finally {
      jest.dontMock('next/dist/compiled/browserslist')
    }
  })
})
