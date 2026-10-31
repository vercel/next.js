import { load } from 'cheerio'
import { FileRef, nextTestSetup, type NextInstance } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

describe('segment-config-precedence', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // TODO: Include these routes once Turbopack accepts conflicting sibling
    // deployment configs. Their individual tests are excluded below.
    buildArgs: process.env.IS_TURBOPACK_TEST
      ? [
          '--debug-build-paths',
          [
            'app/**',
            'pages/**',
            ...[
              'slot-only',
              'sibling-layout',
              'default-config',
              '(config-group)',
              'complex-catchall',
              'nested-slots',
              'intercept',
              'slot-edge-runtime',
              'entry-config',
            ].map((route) => `!app/${route}/**`),
          ].join(','),
        ]
      : undefined,
  })

  it('accepts an undefined maxDuration export', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')

    const manifest = await next.readJSON(
      '.next/server/functions-config-manifest.json'
    )
    expect(manifest.functions['/']).toBeUndefined()
  })

  it.each(['region-string-first', 'region-array-first'])(
    'accepts equivalent preferredRegion values in parallel routes: %s',
    async (route) => {
      const $ = await next.render$(`/${route}`)
      expect($('#children').text()).toBe('children')
      expect($('#slot').text()).toBe('slot')

      const manifest = await next.readJSON(
        '.next/server/functions-config-manifest.json'
      )
      expect(manifest.functions[`/${route}`]).toEqual({ regions: ['iad1'] })
    }
  )

  it.each([
    // TODO: Fix Turbopack rejecting conflicting sibling deployment configs.
    ...(!process.env.IS_TURBOPACK_TEST
      ? [
          {
            pathname: '/slot-only/only',
            request: '/slot-only/only',
            appPath: '/slot-only/@slot/only/page',
            runtime: 'nodejs',
            config: { regions: ['sfo1'], maxDuration: 0 },
          },
          {
            pathname: '/sibling-layout',
            request: '/sibling-layout',
            appPath: '/sibling-layout/page',
            runtime: 'nodejs',
            config: { regions: ['sfo1'], maxDuration: 20 },
          },
          {
            pathname: '/default-config',
            request: '/default-config',
            appPath: '/default-config/page',
            runtime: 'nodejs',
            config: {},
          },
        ]
      : []),
    {
      pathname: '/inheritance/nested',
      request: '/inheritance/nested',
      appPath: '/inheritance/nested/page',
      runtime: 'nodejs',
      config: { regions: ['fra1', 'iad1'], maxDuration: 20 },
    },
    {
      pathname: '/inheritance/nested/partial',
      request: '/inheritance/nested/partial',
      appPath: '/inheritance/nested/partial/page',
      runtime: 'nodejs',
      config: { regions: ['sfo1'], maxDuration: 0 },
    },
    // TODO: Fix Turbopack rejecting conflicting sibling deployment configs.
    ...(!process.env.IS_TURBOPACK_TEST
      ? [
          {
            pathname: '/grouped/[id]',
            request: '/grouped/value',
            appPath: '/(config-group)/grouped/[id]/page',
            runtime: 'edge',
            config: { regions: ['sfo1'], maxDuration: 20 },
          },
          {
            pathname: '/complex-catchall/[...slug]',
            request: '/complex-catchall/one/two',
            appPath: '/complex-catchall/[...slug]/page',
            runtime: 'nodejs',
            config: { regions: ['fra1'], maxDuration: 20 },
          },
          {
            pathname: '/nested-slots',
            request: '/nested-slots',
            appPath: '/nested-slots/page',
            runtime: 'nodejs',
            config: { regions: ['sfo1'], maxDuration: 20 },
          },
        ]
      : []),
  ])(
    'resolves static info through complex loader trees: $pathname',
    async ({ pathname, request, appPath, runtime, config }) => {
      const $ = await next.render$(request)
      expect($('#runtime').text()).toBe(runtime)

      const functionsConfig = await next.readJSON(
        '.next/server/functions-config-manifest.json'
      )
      expect(functionsConfig.functions[pathname]).toEqual(config)

      const manifest = await next.readJSON(
        '.next/server/middleware-manifest.json'
      )
      if (runtime === 'edge') {
        expect(manifest.functions[appPath]).toMatchObject({
          page: appPath,
          regions: config.regions,
        })
      } else {
        expect(manifest.functions[appPath]).toBeUndefined()
      }

      if (pathname === '/slot-only/only') {
        expect($('#default').text()).toBe('default')
        expect($('#other').text()).toBe('other default')
      } else if (pathname === '/default-config') {
        expect($('#slot').text()).toBe('slot default')
      } else if (pathname === '/nested-slots') {
        expect($('#slot').text()).toBe('slot')
        expect($('#other').text()).toBe('nested slot')
      }
    }
  )

  // TODO: Fix Turbopack rejecting conflicting intercepted entry configs at build time.
  // @force-gate !turbopack
  it('keeps intercepted entry config separate from the direct target', async () => {
    const $ = await next.render$('/intercept/target')
    expect($('#runtime').text()).toBe('nodejs')

    const browser = await next.browser('/intercept')
    expect(await browser.elementByCss('#runtime').text()).toBe('nodejs')
    await browser.elementByCss('#target').click()
    await retry(async () => {
      expect(await browser.elementByCss('#intercepted').text()).toBe('edge')
    })

    const appPath = '/intercept/@slot/(.)target/page'
    const middleware = await next.readJSON(
      '.next/server/middleware-manifest.json'
    )
    expect(middleware.functions[appPath]).toMatchObject({
      page: appPath,
      regions: ['iad1'],
    })
    expect(middleware.functions['/intercept/target/page']).toBeUndefined()

    const appPathRoutes = await next.readJSON(
      '.next/app-path-routes-manifest.json'
    )
    const functionsConfig = await next.readJSON(
      '.next/server/functions-config-manifest.json'
    )
    expect(functionsConfig.functions['/intercept/target']).toEqual({
      regions: ['fra1'],
      maxDuration: 30,
    })
    expect(functionsConfig.functions[appPathRoutes[appPath]]).toEqual({
      regions: ['iad1'],
      maxDuration: 10,
    })
  })

  it('preserves dynamic config from a parallel slot', async () => {
    const first = await next.render$('/parallel-dynamic')
    const second = await next.render$('/parallel-dynamic')
    expect(first('#render').text()).not.toBe(second('#render').text())
    expect(first('#slot').text()).toBe('slot')

    const manifest = await next.readJSON('.next/prerender-manifest.json')
    expect(manifest.routes['/parallel-dynamic']).toBeUndefined()
  })

  it('preserves revalidate config from a parallel slot', async () => {
    const $ = await next.render$('/parallel-revalidate')
    expect($('#slot').text()).toBe('slot')

    const manifest = await next.readJSON('.next/prerender-manifest.json')
    expect(
      manifest.routes['/parallel-revalidate'].initialRevalidateSeconds
    ).toBe(60)
  })

  it('preserves fetchCache config from a parallel slot', async () => {
    const $ = await next.render$('/parallel-fetch-cache')
    expect($('#slot').text()).toBe('slot')

    const manifest = await next.readJSON('.next/prerender-manifest.json')
    expect(manifest.routes['/parallel-fetch-cache']).toBeUndefined()
  })

  it.each([
    ['/duration-zero', 0],
    ['/duration-upper-bound', 4294967295],
  ])('accepts maxDuration boundaries: %s', async (route, maxDuration) => {
    const response = await next.fetch(route)
    expect(response.status).toBe(200)
    const manifest = await next.readJSON(
      '.next/server/functions-config-manifest.json'
    )
    expect(manifest.functions[route]).toEqual({ maxDuration })
  })

  it.each([
    {
      route: '/config-handler',
      runtime: 'nodejs',
      config: { regions: ['sfo1'], maxDuration: 0 },
    },
    {
      route: '/config-handler/undefined',
      runtime: 'nodejs',
      config: undefined,
    },
    {
      route: '/config-handler/implicit',
      runtime: 'nodejs',
      config: undefined,
    },
    {
      route: '/config-handler/edge',
      runtime: 'edge',
      config: {},
    },
  ])(
    'uses route handler exports without inheriting page layouts: $route',
    async ({ route, runtime, config }) => {
      const response = await next.fetch(route)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ runtime })
      const manifest = await next.readJSON(
        '.next/server/functions-config-manifest.json'
      )
      expect(manifest.functions[route]).toEqual(config)

      const middleware = await next.readJSON(
        '.next/server/middleware-manifest.json'
      )
      if (runtime === 'edge') {
        expect(middleware.functions[`${route}/route`]).toMatchObject({
          page: `${route}/route`,
        })
        expect(middleware.functions[`${route}/route`].regions).toBeUndefined()
      } else {
        expect(middleware.functions[`${route}/route`]).toBeUndefined()
      }
    }
  )

  it.each([
    ['/config-page', 0],
    ['/undefined-config-page', 20],
  ])(
    'resolves config precedence for Pages Router pages: %s',
    async (route, maxDuration) => {
      const $ = await next.render$(route)
      expect($('#runtime').text()).toBe('nodejs')
      const manifest = await next.readJSON(
        '.next/server/functions-config-manifest.json'
      )
      expect(manifest.functions[route]).toEqual({ maxDuration })
      const middleware = await next.readJSON(
        '.next/server/middleware-manifest.json'
      )
      expect(middleware.functions[route]).toBeUndefined()
    }
  )

  it('does not inherit static info from a sibling parallel slot', async () => {
    const $ = await next.render$('/slot-config-only')
    expect($('#children').text()).toBe('children')
    expect($('#slot').text()).toBe('slot')

    const manifest = await next.readJSON(
      '.next/server/functions-config-manifest.json'
    )
    expect(manifest.functions['/slot-config-only']).toBeUndefined()
  })

  // TODO: Fix Turbopack rejecting conflicting sibling runtime configs at build time.
  // @force-gate !turbopack
  it('does not select the Edge runtime from a sibling parallel slot', async () => {
    const $ = await next.render$('/slot-edge-runtime')
    expect($('#runtime').text()).toBe('nodejs')
    expect($('#slot').text()).toBe('slot')

    const manifest = await next.readJSON(
      '.next/server/middleware-manifest.json'
    )
    expect(manifest.functions['/slot-edge-runtime/page']).toBeUndefined()
  })

  // TODO: Stop Turbopack inheriting Edge regions from sibling parallel slots.
  // @gate !turbopack
  it('does not inherit Edge manifest regions from a sibling parallel slot', async () => {
    const $ = await next.render$('/slot-edge-region')
    expect($('#runtime').text()).toBe('edge')
    expect($('#slot').text()).toBe('slot')

    const manifest = await next.readJSON(
      '.next/server/middleware-manifest.json'
    )
    expect(manifest.functions['/slot-edge-region/page']).toMatchObject({
      page: '/slot-edge-region/page',
    })
    expect(manifest.functions['/slot-edge-region/page'].regions).toBeUndefined()

    const functionsConfig = await next.readJSON(
      '.next/server/functions-config-manifest.json'
    )
    expect(functionsConfig.functions['/slot-edge-region']).toEqual({})
  })

  for (const [route, runtime, region, maxDuration] of [
    ['/entry-config', 'nodejs', 'sfo1', 20],
    ['/entry-config/inherited', 'edge', 'fra1', 30],
  ] as const) {
    // TODO: Fix Turbopack rejecting conflicting entry and parallel slot configs.
    // @force-gate !turbopack
    it(`uses the entry page and ancestor layouts for static info: ${route}`, async () => {
      const $ = await next.render$(route)
      expect($('#runtime').text()).toBe(runtime)
      expect($('#slot').text()).toBe('slot')

      const functionsConfig = await next.readJSON(
        '.next/server/functions-config-manifest.json'
      )
      expect(functionsConfig.functions[route]).toEqual({
        maxDuration,
        regions: [region],
      })

      const manifest = await next.readJSON(
        '.next/server/middleware-manifest.json'
      )
      if (runtime === 'edge') {
        expect(manifest.functions[`${route}/page`]).toMatchObject({
          regions: [region],
        })
      } else {
        expect(manifest.functions[`${route}/page`]).toBeUndefined()
      }
    })
  }

  it.each([
    ['export-first', 'nodejs'],
    ['config-first', 'nodejs'],
    ['undefined-export-first', 'edge'],
    ['undefined-config-first', 'edge'],
  ])(
    'resolves runtime independently of export order: %s',
    async (route, runtime) => {
      const res = await next.fetch(`/api/${route}`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ runtime })

      const manifest = await next.readJSON(
        '.next/server/middleware-manifest.json'
      )
      if (runtime === 'edge') {
        expect(manifest.functions[`/api/${route}`]).toMatchObject({
          page: `/api/${route}`,
        })
      } else {
        expect(manifest.functions[`/api/${route}`]).toBeUndefined()
      }
    }
  )

  it('gives top-level maxDuration precedence and falls back for undefined exports', async () => {
    const manifest = await next.readJSON(
      '.next/server/functions-config-manifest.json'
    )
    expect(manifest.functions['/api/export-first']).toEqual({ maxDuration: 10 })
    expect(manifest.functions['/api/config-first']).toEqual({ maxDuration: 10 })
    expect(manifest.functions['/api/undefined-export-first']).toEqual({
      maxDuration: 20,
    })
    expect(manifest.functions['/api/undefined-config-first']).toEqual({
      maxDuration: 20,
    })
  })

  it('preserves the synthetic Node.js not-found entry configuration', async () => {
    const response = await next.fetch('/missing')
    expect(response.status).toBe(404)
    expect(await response.text()).toContain(
      '<p id="not-found-runtime">nodejs</p>'
    )

    // The functions manifest omits this synthetic entry, so maxDuration and
    // preferredRegion are not directly tested here; only non-leakage is checked.
    const functionsConfig = await next.readJSON(
      '.next/server/functions-config-manifest.json'
    )
    expect(functionsConfig.functions['/_not-found']).toBeUndefined()
    expect(functionsConfig.functions['/']).toBeUndefined()

    const middleware = await next.readJSON(
      '.next/server/middleware-manifest.json'
    )
    expect(middleware.functions['/_not-found/page']).toBeUndefined()
  })
})

describe('synthetic not-found config: ignored edge exports', () => {
  const { next } = nextTestSetup({
    files: `${__dirname}/fixtures/not-found`,
  })

  // TODO: Align Turbopack's synthetic not-found runtime with root layout inheritance.
  // @gate !turbopack
  it('inherits the root layout runtime instead of the not-found exports', async () => {
    const response = await next.fetch('/missing')
    expect(response.status).toBe(404)
    // Match webpack's questionable behavior: the synthetic /_not-found/page entry
    // inherits runtime and deployment config from the root layout, ignoring the
    // edge, sfo1, and maxDuration: 20 exports from app/not-found.tsx.
    // TODO: Revisit whether both bundlers should honor the not-found exports.
    expect(await response.text()).toContain(
      '<p id="not-found-runtime">nodejs</p>'
    )

    const functionsConfig = await next.readJSON(
      '.next/server/functions-config-manifest.json'
    )
    // The shared JS manifest writer omits the synthetic not-found entry.
    expect(functionsConfig.functions['/_not-found']).toBeUndefined()
    expect(functionsConfig.functions['/']).toEqual({
      regions: ['iad1'],
      maxDuration: 10,
    })

    const middleware = await next.readJSON(
      '.next/server/middleware-manifest.json'
    )
    expect(middleware.functions['/_not-found/page']).toBeUndefined()
  })
})

describe('segment-config validation', () => {
  describe('invalid maxDuration values', () => {
    const invalidValues = [
      ['negative', '-1'],
      ['fractional', '1.5'],
      ['nan', 'NaN'],
      ['infinity', 'Infinity'],
      ['string', '"10"'],
      ['null', 'null'],
      ['boolean', 'true'],
      ['object', '{}'],
      ['array', '[]'],
    ]
    const { next, isTurbopack } = nextTestSetup({
      files: `${__dirname}/fixtures/validation`,
      skipStart: true,
      overrideFiles: Object.fromEntries(
        invalidValues.map(([route, value]) => [
          `app/${route}/page.tsx`,
          `
            export const maxDuration = ${value}

            export default function Page() {
              return <p>hello world</p>
            }
          `,
        ])
      ),
    })

    it('validates all invalid maxDuration values in one build', async () => {
      const result = await next.build()
      expect(result.exitCode).toBe(1)
      expect(result.cliOutput).toContain('maxDuration')

      // Turbopack reports every invalid route. Webpack stops at the first
      // invalid segment config, so it only reports one of these routes.
      if (isTurbopack) {
        const output = result.cliOutput.replace(/\\/g, '/')
        for (const [route] of invalidValues) {
          expect(output).toContain(`app/${route}/page.tsx`)
        }
      } else {
        expect(result.cliOutput).toMatch(
          new RegExp(
            `Invalid segment configuration options detected for "/(${invalidValues
              .map(([route]) => route)
              .join('|')})"`
          )
        )
      }
    })
  })
})

// These cases need separate builds so one rejected config cannot hide the others.
// Cache Components does not support the legacy route-segment exports tested here.
// @force-gate !cacheComponents
describe('segment-config-parity', () => {
  const fixtures = path.join(__dirname, 'fixtures', 'parity')

  function commonFiles() {
    return {
      app: new FileRef(path.join(fixtures, 'common', 'app')),
    }
  }

  function routeFiles(name: string, parallel = false) {
    return {
      ...commonFiles(),
      ...(parallel
        ? {
            'app/check/layout.jsx': new FileRef(
              path.join(fixtures, 'common', 'slot-layout.jsx')
            ),
          }
        : {}),
      'app/check': new FileRef(path.join(fixtures, name)),
    }
  }

  async function buildAndStart(next: NextInstance) {
    const { exitCode, cliOutput } = await next.build()
    // Include the build diagnostic when a bundler rejects a webpack-valid fixture.
    expect({ exitCode, cliOutput }).toEqual({
      exitCode: 0,
      cliOutput: expect.any(String),
    })
    await next.start({ skipBuild: true })
  }

  async function expectNodeNotFound(next: NextInstance) {
    const response = await next.fetch('/missing')
    expect(response.status).toBe(404)
    const $ = load(await response.text())
    expect($('#runtime').text()).toBe('nodejs')

    const middleware = await next.readJSON(
      '.next/server/middleware-manifest.json'
    )
    expect(middleware.functions['/_not-found/page']).toBeUndefined()
    return $
  }

  describe('synthetic not-found', () => {
    const { next } = nextTestSetup({
      files: {
        ...commonFiles(),
        'app/layout.jsx': new FileRef(
          path.join(fixtures, 'not-found', 'layout.jsx')
        ),
        'app/not-found.jsx': new FileRef(
          path.join(fixtures, 'not-found', 'not-found.jsx')
        ),
      },
      skipStart: true,
    })

    it('supports a Node-only custom 404 under an Edge root layout', async () => {
      await buildAndStart(next)
      const page = await next.render$('/')
      expect(page('#runtime').text()).toBe('nodejs')
      const $ = await expectNodeNotFound(next)
      expect($('#node-api').text()).toBe('function')
    })
  })

  describe.each(['dynamic', 'dynamic-layout', 'revalidate', 'fetch-cache'])(
    'unequal sibling rendering config: %s',
    (fixture) => {
      const { next } = nextTestSetup({
        files: routeFiles(fixture, true),
        skipStart: true,
      })

      it('builds and renders both branches with their rendering configs', async () => {
        await buildAndStart(next)
        const $ = await next.render$('/check')
        expect($('#children').text()).toBe('children')
        expect($('#slot').text()).toBe('slot')

        if (fixture === 'dynamic' || fixture === 'dynamic-layout') {
          const second = await next.render$('/check')
          expect($('#render').text()).not.toBe('')
          expect(second('#render').text()).not.toBe($('#render').text())
          const prerender = await next.readJSON('.next/prerender-manifest.json')
          expect(prerender.routes['/check']).toBeUndefined()
        } else if (fixture === 'revalidate') {
          const prerender = await next.readJSON('.next/prerender-manifest.json')
          expect(prerender.routes['/check'].initialRevalidateSeconds).toBe(60)
        }
      })
    }
  )

  describe('unequal sibling dynamicParams', () => {
    const { next } = nextTestSetup({
      files: routeFiles('dynamic-params', true),
      skipStart: true,
    })

    it('renders the generated parameter and rejects an ungenerated one', async () => {
      await buildAndStart(next)
      const $ = await next.render$('/check/known')
      expect($('#children').text()).toBe('known')
      expect($('#slot').text()).toBe('slot')
      expect((await next.fetch('/check/unknown')).status).toBe(404)
    })
  })

  describe('global-not-found deployment exports', () => {
    const { next } = nextTestSetup({
      files: {
        ...commonFiles(),
        'app/global-not-found.jsx': new FileRef(
          path.join(fixtures, 'global-not-found', 'global-not-found.jsx')
        ),
        'next.config.js': new FileRef(
          path.join(fixtures, 'global-not-found', 'next.config.js')
        ),
      },
      skipStart: true,
    })

    it('does not turn a global 404 into an Edge function with regions', async () => {
      await buildAndStart(next)
      await expectNodeNotFound(next)
    })
  })

  describe('explicit children slot', () => {
    const { next } = nextTestSetup({
      files: routeFiles('explicit-children'),
      skipStart: true,
    })

    it('accepts an ordinary page alongside an explicit @children page', async () => {
      await buildAndStart(next)
      const response = await next.fetch('/check')
      expect(response.status).toBe(200)
      const $ = load(await response.text())
      expect($('#which').text()).toBe('main')
      expect($('#runtime').text()).toBe('edge')

      const middleware = await next.readJSON(
        '.next/server/middleware-manifest.json'
      )
      expect(middleware.functions['/check/page']).toBeDefined()
      expect(middleware.functions['/check/@children/page']).toBeDefined()
    })
  })

  // The normal u32 boundary is covered by the shared fixture above.
  describe('maxDuration above the u32 boundary', () => {
    const { next } = nextTestSetup({
      files: routeFiles('duration-above-u32'),
      skipStart: true,
    })

    it('accepts the non-negative integer and preserves its manifest value', async () => {
      await buildAndStart(next)
      const $ = await next.render$('/check')
      expect($('#children').text()).toBe('children')
      const functionsConfig = await next.readJSON(
        '.next/server/functions-config-manifest.json'
      )
      expect(functionsConfig.functions['/check']).toEqual({
        maxDuration: 4294967296,
      })
    })
  })

  describe('duplicate layout extensions', () => {
    const { next } = nextTestSetup({
      files: {
        ...routeFiles('layout-extensions'),
        'next.config.js': new FileRef(
          path.join(fixtures, 'layout-extensions.config.js')
        ),
      },
      skipStart: true,
    })

    it('uses the first page extension for both the layout and its runtime', async () => {
      await buildAndStart(next)
      const $ = await next.render$('/check')
      expect($('#layout').text()).toBe('jsx')
      expect($('#runtime').text()).toBe('edge')
      const middleware = await next.readJSON(
        '.next/server/middleware-manifest.json'
      )
      expect(middleware.functions['/check/page']).toBeDefined()
    })
  })
})
