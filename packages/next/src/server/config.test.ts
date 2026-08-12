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

  describe('experimental.turbopackModuleFederation validation', () => {
    let configNumber = 0

    async function expectInvalidConfig(config: unknown, message: RegExp) {
      configNumber++
      await expect(
        loadConfig(
          PHASE_PRODUCTION_BUILD,
          `${__dirname}/module-federation-${configNumber}`,
          {
            customConfig: {
              experimental: {
                turbopackModuleFederation: config,
              },
            },
          }
        )
      ).rejects.toThrow(message)
    }

    it('accepts the supported client-only eager configuration', async () => {
      const result = await loadConfig(
        PHASE_PRODUCTION_BUILD,
        `${__dirname}/module-federation-valid`,
        {
          customConfig: {
            experimental: {
              turbopackModuleFederation: {
                name: 'remoteApp',
                filename: 'static/chunks/remoteEntry.js',
                exposes: {
                  './Button': {
                    import: ['./polyfill', './components/Button'],
                  },
                },
                remotes: {
                  shell: {
                    origin: ['https://example.com', '/fallback'],
                    shareScope: 'default',
                  },
                  products: {
                    name: 'productContainer',
                    entry: 'https://cdn.example.com/products-entry.js',
                  },
                  account: 'https://account.example.com',
                },
                shared: {
                  react: {
                    shareScope: 'default',
                    version: '19.1.0',
                    requiredVersion: '^19.0.0',
                    singleton: true,
                    strictVersion: true,
                    eager: true,
                  },
                  'react-dom': false,
                  localState: { import: './lib/local-state', eager: true },
                  consumerOnly: {
                    import: false,
                    requiredVersion: '^1.0.0',
                    strictVersion: true,
                  },
                },
              },
            },
          },
        }
      )

      expect(result.experimental.turbopackModuleFederation?.name).toBe(
        'remoteApp'
      )
    })

    it('rejects names that cannot safely identify browser containers', async () => {
      await expectInvalidConfig(
        { name: 'remote-app' },
        /\.name: must be a valid JavaScript identifier/
      )
      await expectInvalidConfig(
        {
          name: 'shell',
          remotes: {
            remoteApp: {
              name: 'remote-app',
              origin: 'https://example.com',
            },
          },
        },
        /\.remotes\["remoteApp"\]\.name: must be a valid JavaScript identifier/
      )
      for (const reservedName of [
        'window',
        'self',
        'globalThis',
        'document',
        'location',
        'top',
        'parent',
        'frames',
        'navigator',
        'history',
        'name',
        'alert',
        'TURBOPACK',
        '__webpack_share_scopes__',
        '__webpack_init_sharing__',
        '__TURBOPACK_MF_CONTAINERS__',
      ]) {
        await expectInvalidConfig(
          { name: reservedName },
          /\.name: must not overwrite a reserved browser or bundler global/
        )
      }
      await expectInvalidConfig(
        {
          name: 'shell',
          remotes: {
            next: {
              name: 'window',
              origin: 'https://example.com',
            },
          },
        },
        /\.remotes\["next"\]\.name: must not overwrite a reserved browser or bundler global/
      )
    })

    it('rejects prototype-sensitive object property names', async () => {
      for (const name of ['__proto__', 'prototype', 'constructor']) {
        await expectInvalidConfig(
          { name },
          /\.name: must not be "__proto__", "prototype", or "constructor"/
        )
      }
      await expectInvalidConfig(
        {
          name: 'shell',
          remotes: {
            remoteApp: {
              name: 'constructor',
              origin: 'https://example.com',
            },
          },
        },
        /\.remotes\["remoteApp"\]\.name: must not be "__proto__", "prototype", or "constructor"/
      )
      await expectInvalidConfig(
        { name: 'shell', shareScope: '__proto__' },
        /\.shareScope: must not be "__proto__", "prototype", or "constructor"/
      )
      await expectInvalidConfig(
        {
          name: 'shell',
          remotes: {
            remoteApp: {
              origin: '/remote',
              shareScope: 'prototype',
            },
          },
        },
        /\.remotes\["remoteApp"\]\.shareScope: must not be "__proto__", "prototype", or "constructor"/
      )
      await expectInvalidConfig(
        {
          name: 'shell',
          shared: { constructor: true },
        },
        /\.shared\["constructor"\]: must not be "__proto__", "prototype", or "constructor"/
      )
      await expectInvalidConfig(
        {
          name: 'shell',
          shared: { react: { shareKey: '__proto__' } },
        },
        /\.shared\["react"\]\.shareKey: must not be "__proto__", "prototype", or "constructor"/
      )
    })

    it('keeps emitted filenames inside the served client static directory', async () => {
      const result = await loadConfig(
        PHASE_PRODUCTION_BUILD,
        `${__dirname}/module-federation-custom-static-filename`,
        {
          customConfig: {
            experimental: {
              turbopackModuleFederation: {
                name: 'remoteApp',
                filename: 'static/custom-v1.2/remote_entry-1.2.js',
              },
            },
          },
        }
      )
      expect(result.experimental.turbopackModuleFederation?.filename).toBe(
        'static/custom-v1.2/remote_entry-1.2.js'
      )

      for (const filename of [
        'static',
        'static/',
        'static/chunks',
        'static/chunks/remoteEntry.css',
        'static/chunks/.js',
        'static/%2e%2e/remoteEntry.js',
        'static/chunks%2FremoteEntry.js',
        'static/chunks/remote:Entry.js',
        'static/chunks/"remoteEntry".js',
        'static/chunks/remote*Entry.js',
        'static/chunks/remote<Entry.js',
        'static/chunks/remote>Entry.js',
        'static/chunks/remote|Entry.js',
        'static/CON.js',
        'static/nul/remoteEntry.js',
        'static/aux.txt.js',
        'static/com1/remoteEntry.js',
        'static/LPT9.js',
        'remoteEntry.js',
        'chunks/remoteEntry.js',
        'assets/remoteEntry.js',
        '/remoteEntry.js',
        '../remoteEntry.js',
        'static/../remoteEntry.js',
        'static\\remoteEntry.js',
        'C:/remoteEntry.js',
        'static//remoteEntry.js',
        'remoteEntry.js?x=1',
      ]) {
        await expectInvalidConfig(
          { name: 'remoteApp', filename },
          /\.filename: must name a portable \.js file below "static\/" using only letters, numbers, dots, underscores, and hyphens/
        )
      }
    })

    it('only permits safe project-relative exposed module requests', async () => {
      await expectInvalidConfig(
        {
          name: 'remoteApp',
          exposes: { Button: './components/Button' },
        },
        /\.exposes\["Button"\].*project-relative module request/
      )
      await expectInvalidConfig(
        {
          name: 'remoteApp',
          exposes: { './Button': '../components/Button' },
        },
        /\.exposes\["\.\/Button"\]\.import.*project-relative module request/
      )
    })

    it('only permits supported remote URL schemes and safe URLs', async () => {
      for (const remote of [
        ['javascript', ':alert(1)'].join(''),
        'data:text/javascript,alert(1)',
        'file:///tmp/remoteEntry.js',
        'ftp://example.com/remoteEntry.js',
        'https://example.com/remote Entry.js',
        'https://example.com\\remoteEntry.js',
        'https://example.com/remoteEntry.js\nignored',
      ]) {
        await expectInvalidConfig(
          { name: 'shell', remotes: { remoteApp: remote } },
          /\.remotes\["remoteApp"\]\.origin: must be an HTTP\(S\) or relative URL/
        )
      }

      await expectInvalidConfig(
        {
          name: 'shell',
          remotes: {
            remoteApp: 'remoteApp@https://example.com/static/remoteEntry.js',
          },
        },
        /\.remotes\["remoteApp"\]\.origin: must not include a "containerName@" prefix/
      )

      await expectInvalidConfig(
        {
          name: 'shell',
          remotes: {
            remoteApp: 'https://example.com/_next/static/chunks/remoteEntry.js',
          },
        },
        /\.remotes\["remoteApp"\]\.origin: must be an application origin or base path; use \{ entry \}/
      )
    })

    it('rejects unsupported or inconsistent shared settings', async () => {
      await expectInvalidConfig(
        {
          name: 'shell',
          shared: { react: { eager: false } },
        },
        /\.shared\["react"\]\.eager: only eager shared modules are supported/
      )
      await expectInvalidConfig(
        {
          name: 'shell',
          shared: { react: '^19.0.0' },
        },
        /\.shared\["react"\]: string version shorthand is not supported/
      )
      await expectInvalidConfig(
        {
          name: 'shell',
          shareScope: 'host',
          shared: { react: { shareScope: 'remote' } },
        },
        /\.shared\["react"\]\.shareScope: must match the top-level shareScope \("host"\)/
      )
      await expectInvalidConfig(
        {
          name: 'shell',
          shared: { react: { requiredVersion: '^19.0.0' } },
        },
        /\.shared\["react"\]\.version: is required when a locally provided shared module sets requiredVersion/
      )
      await expectInvalidConfig(
        {
          name: 'shell',
          shared: { react: { version: 'not-semver' } },
        },
        /\.shared\["react"\]\.version: must be a valid semantic version/
      )
      await expectInvalidConfig(
        {
          name: 'shell',
          shared: { react: { strictVersion: true } },
        },
        /\.shared\["react"\]\.strictVersion: requires a requiredVersion range/
      )
    })
  })
})
