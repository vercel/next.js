import { PHASE_INFO, PHASE_PRODUCTION_BUILD } from '../api/constants'

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

  describe('cacheHandlers validation', () => {
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
              cacheHandlers: {
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
          cacheHandlers: {
            abc: __filename,
            'valid-handler': __filename,
            'abc-def': __filename,
          },
        },
      })
      expect(result.cacheHandlers).toBeDefined()
      expect(result.cacheHandlers?.['abc']).toBeDefined()
      expect(result.cacheHandlers?.['valid-handler']).toBeDefined()
      expect(result.cacheHandlers?.['abc-def']).toBeDefined()
    })
  })

  describe('experimental.cssChunking bundler validation', () => {
    it('should not validate `cssChunking` during `next info`', async () => {
      const result = await loadConfig(PHASE_INFO, __dirname, {
        customConfig: { experimental: { cssChunking: 'graph' } },
      })
      expect(result.experimental.cssChunking).toBe('graph')
    })
  })
})
