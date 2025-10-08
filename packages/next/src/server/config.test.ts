import { PHASE_PRODUCTION_BUILD } from '../api/constants'

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

    it('should not print a stack trace when throwing an error', async () => {
      const loadConfigPromise = loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          experimental: {
            ppr: true,
          },
        },
      })

      await expect(loadConfigPromise).rejects.toThrow(
        /The experimental feature "experimental.ppr" can only be enabled when using the latest canary version of Next.js./
      )

      try {
        await loadConfigPromise
      } catch (error: any) {
        expect(error).toBeInstanceOf(Error)

        // Check that there's no stack trace
        expect(error.stack).toBeUndefined()
      }
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
        /The experimental feature "experimental.ppr" can only be enabled when using the latest canary version of Next.js./
      )
    })

    it('errors when using cacheComponents if not in canary', async () => {
      await expect(
        loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
          customConfig: {
            experimental: {
              cacheComponents: true,
            },
          },
        })
      ).rejects.toThrow(
        /The experimental feature "experimental.cacheComponents" can only be enabled when using the latest canary version of Next.js./
      )
    })

    it('errors when using persistentCachingForBuild if not in canary', async () => {
      await expect(
        loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
          customConfig: {
            experimental: {
              turbopackFileSystemCacheForBuild: true,
            },
          },
        })
      ).rejects.toThrow(
        /The experimental feature "experimental.turbopackFileSystemCacheForBuild" can only be enabled when using the latest canary version of Next.js./
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

    it('errors when cacheComponents is enabled but PPR is disabled', async () => {
      await expect(
        loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
          customConfig: {
            experimental: {
              cacheComponents: true,
              ppr: false,
            },
          },
        })
      ).rejects.toThrow(
        '`experimental.ppr` can not be `false` when `experimental.cacheComponents` is `true`. PPR is implicitly enabled when Cache Components is enabled.'
      )
    })

    it('errors when rdcForNavigations is enabled but ppr is disabled', async () => {
      await expect(
        loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
          customConfig: {
            experimental: {
              rdcForNavigations: true,
              ppr: false,
            },
          },
        })
      ).rejects.toThrow(
        '`experimental.rdcForNavigations` is enabled, but `experimental.ppr` is not.'
      )
    })

    it('defaults rdcForNavigations to true when ppr is enabled', async () => {
      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          experimental: {
            ppr: true,
          },
        },
      })

      expect(result.experimental.rdcForNavigations).toBe(true)
    })

    it('allows explicitly disabling rdcForNavigations when ppr is enabled', async () => {
      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          experimental: {
            ppr: true,
            rdcForNavigations: false,
          },
        },
      })

      expect(result.experimental.rdcForNavigations).toBe(false)
    })

    it('errors when cacheComponents is enabled but PPR set to "incremental"', async () => {
      await expect(
        loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
          customConfig: {
            experimental: {
              cacheComponents: true,
              ppr: 'incremental',
            },
          },
        })
      ).rejects.toThrow(
        '`experimental.ppr` can not be `"incremental"` when `experimental.cacheComponents` is `true`. PPR is implicitly enabled when Cache Components is enabled.'
      )
    })

    it('migrates experimental.dynamicIO to experimental.cacheComponents', async () => {
      process.env.__NEXT_VERSION = 'canary'

      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          experimental: {
            dynamicIO: true,
          },
        },
        silent: true,
      })

      expect(result.experimental.cacheComponents).toBe(true)
      expect(result.experimental.dynamicIO).toBeUndefined()

      delete process.env.__NEXT_VERSION
    })

    it('preserves cacheComponents when both dynamicIO and cacheComponents are set', async () => {
      process.env.__NEXT_VERSION = 'canary'

      const result = await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          experimental: {
            dynamicIO: true,
            cacheComponents: false,
          },
        },
        silent: true,
      })

      expect(result.experimental.cacheComponents).toBe(false)
      expect(result.experimental.dynamicIO).toBeUndefined()

      delete process.env.__NEXT_VERSION
    })

    it('warns when using deprecated experimental.dynamicIO', async () => {
      process.env.__NEXT_VERSION = 'canary'

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      await loadConfig(PHASE_PRODUCTION_BUILD, __dirname, {
        customConfig: {
          experimental: {
            dynamicIO: true,
          },
        },
        silent: false,
      })

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '`experimental.dynamicIO` has been renamed to `experimental.cacheComponents`'
        )
      )

      consoleSpy.mockRestore()
      delete process.env.__NEXT_VERSION
    })
  })
})
