import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_INFO,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from '../api/constants'
import {
  getStrictRouteMatchingDefaultWarning,
  STRICT_ROUTE_MATCHING_DEFAULT_WARNING,
} from './lib/router-utils/strict-route-matching-config'
import { configSchema } from './config-schema'

describe('loadConfig', () => {
  let loadConfig: typeof import('./config').default

  beforeEach(async () => {
    // Reset the module cache to ensure each test gets a fresh config load
    // This is important because config.ts now has a module-level configCache
    jest.resetModules()

    // Dynamically import the module after reset to get a fresh instance
    const configModule = await import('./config')
    loadConfig = configModule.default
  })
  describe('nextConfig.images defaults', () => {
    it('should assign a `images.remotePatterns` when using assetPrefix', async () => {
      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          assetPrefix: 'https://cdn.example.com',
          images: {
            formats: ['image/webp'],
          },
        },
      })

      expect(result.images.remotePatterns).toMatchInlineSnapshot(`
        [
          {
            "hostname": "cdn.example.com",
            "port": "",
            "protocol": "https",
          },
        ]
      `)
    })

    it('should not assign a duplicate `images.remotePatterns` value when using assetPrefix', async () => {
      let result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          assetPrefix: 'https://cdn.example.com',
          images: {
            formats: ['image/webp'],
            remotePatterns: [
              {
                hostname: 'cdn.example.com',
                port: '',
                protocol: 'https',
              },
            ],
          },
        },
      })

      expect(result.images.remotePatterns.length).toBe(1)

      result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          assetPrefix: 'https://cdn.example.com/foobar',
          images: {
            formats: ['image/webp'],
            remotePatterns: [
              {
                hostname: 'cdn.example.com',
                port: '',
                protocol: 'https',
              },
            ],
          },
        },
      })

      expect(result.images.remotePatterns.length).toBe(1)
    })
  })

  describe('canary-only features', () => {
    beforeAll(() => {
      process.env.__NEXT_VERSION = '14.2.0'
    })

    afterAll(() => {
      delete process.env.__NEXT_VERSION
    })

    it('errors when using PPR if not in canary', async () => {
      await expect(
        loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
          customConfig: {
            experimental: {
              ppr: true,
            },
          },
        })
      ).rejects.toThrow(
        /`experimental\.ppr` has been merged into `cacheComponents`/
      )
    })
  })
  describe('with a canary version', () => {
    beforeAll(() => {
      process.env.__NEXT_VERSION = '15.4.0-canary.35'
    })

    afterAll(() => {
      delete process.env.__NEXT_VERSION
    })

    it('errors when ppr is set to incremental', async () => {
      await expect(
        loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
          customConfig: {
            experimental: {
              ppr: 'incremental',
            },
          },
        })
      ).rejects.toThrow(
        /`experimental\.ppr` has been merged into `cacheComponents`/
      )
    })
  })

  describe('middleware to proxy config key rename backward/forward compatibility', () => {
    it('should copy `skipMiddlewareUrlNormalize value` to `skipProxyUrlNormalize`', async () => {
      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          skipMiddlewareUrlNormalize: true,
        },
      })

      expect(result.skipProxyUrlNormalize).toBe(true)
    })

    it('should copy `experimental.middlewarePrefetch` to `experimental.proxyPrefetch`', async () => {
      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          experimental: {
            middlewarePrefetch: 'strict',
          },
        },
      })

      expect(result.experimental.proxyPrefetch).toBe('strict')
    })

    it('should copy `experimental.externalMiddlewareRewritesResolve` to `experimental.externalProxyRewritesResolve`', async () => {
      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          experimental: {
            externalMiddlewareRewritesResolve: true,
          },
        },
      })

      expect(result.experimental.externalProxyRewritesResolve).toBe(true)
    })

    it('should copy `skipProxyUrlNormalize` to `skipMiddlewareUrlNormalize`', async () => {
      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          skipProxyUrlNormalize: true,
        },
      })

      expect(result.skipMiddlewareUrlNormalize).toBe(true)
      expect(result.skipProxyUrlNormalize).toBe(true)
    })

    it('should copy `experimental.proxyPrefetch` to `experimental.middlewarePrefetch`', async () => {
      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          experimental: {
            proxyPrefetch: 'strict',
          },
        },
      })

      expect(result.experimental.middlewarePrefetch).toBe('strict')
      expect(result.experimental.proxyPrefetch).toBe('strict')
    })

    it('should copy `experimental.externalProxyRewritesResolve` to `experimental.externalMiddlewareRewritesResolve`', async () => {
      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          experimental: {
            externalProxyRewritesResolve: true,
          },
        },
      })

      expect(result.experimental.externalMiddlewareRewritesResolve).toBe(true)
      expect(result.experimental.externalProxyRewritesResolve).toBe(true)
    })
  })

  describe('parallel route matching flags', () => {
    it('enables strict route matching by default and exposes the opt-out warning', async () => {
      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {},
      })

      expect(result.experimental.strictRouteMatching).toBe(true)
      expect(getStrictRouteMatchingDefaultWarning(result)).toBe(
        STRICT_ROUTE_MATCHING_DEFAULT_WARNING
      )
    })

    it('allows loose route matching through the deprecated opt-out', async () => {
      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          deprecated: {
            looseRouteMatching: true,
          },
        },
      })

      expect(result.experimental.strictRouteMatching).toBe(false)
      expect(getStrictRouteMatchingDefaultWarning(result)).toBeUndefined()
    })

    it('only accepts true for the deprecated opt-out', () => {
      expect(
        configSchema.safeParse({
          deprecated: { looseRouteMatching: true },
        }).success
      ).toBe(true)
      expect(
        configSchema.safeParse({
          deprecated: { looseRouteMatching: false },
        }).success
      ).toBe(false)
    })

    it('disables strict route matching when explicit children detection is disabled', async () => {
      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          experimental: {
            explicitParallelRouteChildren: false,
          },
        },
      })

      expect(result.experimental.explicitParallelRouteChildren).toBe(false)
      expect(result.experimental.strictRouteMatching).toBe(false)
      expect(getStrictRouteMatchingDefaultWarning(result)).toBeUndefined()
    })
  })

  describe.each(['cacheHandlers', 'buildCacheHandlers'] as const)(
    '%s validation',
    (option) => {
      it('should reject invalid keys', async () => {
        const invalidKeys = [
          'abc123',
          'abc_123',
          'abc.def',
          'handler!',
          '123handler',
          'handler123',
        ]

        for (const key of invalidKeys) {
          await expect(
            loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
              customConfig: {
                [option]: {
                  [key]: __filename,
                },
              },
            })
          ).rejects.toThrow(/key must only use characters a-z and -/)
        }
      })

      it('should accept valid keys', async () => {
        const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
          customConfig: {
            [option]: {
              abc: __filename,
              'valid-handler': __filename,
              'abc-def': __filename,
            },
          },
        })
        expect(result[option]).toBeDefined()
        expect(result[option]?.['abc']).toBeDefined()
        expect(result[option]?.['valid-handler']).toBeDefined()
        expect(result[option]?.['abc-def']).toBeDefined()
      })

      it('should reject private handlers', async () => {
        await expect(
          loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
            customConfig: { [option]: { private: __filename } },
          })
        ).rejects.toThrow('cannot be customized')
      })

      it('should reject missing handler files during build', async () => {
        await expect(
          loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
            customConfig: {
              [option]: { default: './missing-cache-handler.js' },
            },
          })
        ).rejects.toThrow('cache handler path provided does not exist')
      })
    }
  )

  it.each([
    ['default', 'NEXT_DEFAULT_BUILD_CACHE_HANDLER_PATH'],
    ['remote', 'NEXT_REMOTE_BUILD_CACHE_HANDLER_PATH'],
    ['static', 'NEXT_STATIC_BUILD_CACHE_HANDLER_PATH'],
  ] as const)('uses %s build handler from %s', async (kind, envName) => {
    const env = jest.replaceProperty(process, 'env', {
      ...process.env,
      [envName]: __filename,
    })

    try {
      // Defaults read the environment when config-shared is first imported.
      jest.resetModules()
      const { default: loadConfigWithEnv } = await import('./config')
      const result = await loadConfigWithEnv(
        PHASE_PRODUCTION_BUILD,
        __dirname,
        {
          customConfig: {},
        }
      )
      expect(result.buildCacheHandlers?.[kind]).toBe(__filename)

      jest.resetModules()
      const { default: loadConfigWithOverride } = await import('./config')
      const override = require.resolve('./config-shared')
      const overriddenResult = await loadConfigWithOverride(
        PHASE_PRODUCTION_BUILD,
        __dirname,
        {
          customConfig: { buildCacheHandlers: { [kind]: override } },
        }
      )
      expect(overriddenResult.buildCacheHandlers?.[kind]).toBe(override)
    } finally {
      env.restore()
      jest.resetModules()
    }
  })

  it('omits unset build handler environment defaults', async () => {
    const env = jest.replaceProperty(process, 'env', {
      ...process.env,
      NEXT_DEFAULT_BUILD_CACHE_HANDLER_PATH: undefined,
      NEXT_REMOTE_BUILD_CACHE_HANDLER_PATH: undefined,
      NEXT_STATIC_BUILD_CACHE_HANDLER_PATH: undefined,
    })

    try {
      jest.resetModules()
      const { default: loadConfigWithEnv } = await import('./config')
      const result = await loadConfigWithEnv(
        PHASE_PRODUCTION_BUILD,
        __dirname,
        {
          customConfig: {},
        }
      )
      expect(result.buildCacheHandlers).toEqual({})
    } finally {
      env.restore()
      jest.resetModules()
    }
  })

  it.each([PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_SERVER] as const)(
    'should not require build handler files in phase %s',
    async (phase) => {
      await expect(
        loadConfig(phase, __dirname, {
          customConfig: {
            buildCacheHandlers: { default: './missing-build-handler.js' },
          },
        })
      ).resolves.toBeDefined()
    }
  )

  describe('partialPrefetching validation', () => {
    const warning = [
      '⚠ `cacheComponents` is enabled without a corresponding `partialPrefetching` option. Set `partialPrefetching` to either `true` or `false`.',
      "The only reason to set `partialPrefetching` to `false` is if you're migrating an older Cache Components app. The initial release of Cache Components did not include Partial Prefetching. New projects should enable both Cache Components and Partial Prefetching.",
      'Both Cache Components and Partial Prefetching will be enabled everywhere in the next major release, and the old configurations will be removed.',
      'Learn more: https://nextjs.org/docs/app/guides/adopting-partial-prefetching',
    ].join('\n\n')

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('warns when cacheComponents is enabled without partialPrefetching', async () => {
      const consoleWarn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          cacheComponents: true,
        },
        silent: false,
      })

      expect(consoleWarn).toHaveBeenCalledWith(warning)
    })

    it.each([true, false])(
      'does not warn when partialPrefetching is explicitly set to %s',
      async (partialPrefetching) => {
        const consoleWarn = jest
          .spyOn(console, 'warn')
          .mockImplementation(() => {})

        await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
          customConfig: {
            cacheComponents: true,
            partialPrefetching,
          },
          silent: false,
        })

        expect(consoleWarn).not.toHaveBeenCalledWith(
          expect.stringContaining(warning)
        )
      }
    )
  })

  describe('experimental.cssChunking bundler validation', () => {
    it('should not validate `cssChunking` during `next info`', async () => {
      const result = await loadConfig(PHASE_INFO, __dirname, {
        customConfig: { experimental: { cssChunking: 'graph' } },
      })
      expect(result.experimental.cssChunking).toBe('graph')
    })
  })

  describe('experimental.durableUseCacheEntries', () => {
    const originalTurbopack = process.env.TURBOPACK

    afterEach(() => {
      if (originalTurbopack === undefined) {
        delete process.env.TURBOPACK
      } else {
        process.env.TURBOPACK = originalTurbopack
      }
    })

    it('throws when using webpack', async () => {
      delete process.env.TURBOPACK

      await expect(
        loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
          customConfig: {
            experimental: { durableUseCacheEntries: true },
          },
        })
      ).rejects.toThrow(/only supported with Turbopack/)
    })

    it('is preserved when using Turbopack', async () => {
      process.env.TURBOPACK = '1'

      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          experimental: { durableUseCacheEntries: true },
        },
      })

      expect(result.experimental.durableUseCacheEntries).toBe(true)
    })
  })
})
