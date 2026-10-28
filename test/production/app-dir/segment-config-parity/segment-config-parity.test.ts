import { load } from 'cheerio'
import { FileRef, nextTestSetup, type NextInstance } from 'e2e-utils'
import path from 'path'

const fixtures = path.join(__dirname, 'fixtures')

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

describe('segment-config-parity', () => {
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

  describe.each([
    { fixture: 'duration-u32', duration: 4294967295 },
    { fixture: 'duration-above-u32', duration: 4294967296 },
  ])('maxDuration: $duration', ({ fixture, duration }) => {
    const { next } = nextTestSetup({
      files: routeFiles(fixture),
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
        maxDuration: duration,
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
