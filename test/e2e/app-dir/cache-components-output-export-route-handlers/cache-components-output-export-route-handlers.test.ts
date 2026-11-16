import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import serveHandler from 'serve-handler'

const methods = ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

// These assertions inspect local export artifacts and dev/build validation.
// @force-gate !deploy
describe('Cache Components exported Route Handlers', () => {
  describe('complete responses', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'static'),
      skipStart: true,
    })
    let server: Server | undefined
    let origin: string

    beforeAll(async () => {
      if (isNextDev) {
        await next.start()
        origin = next.url
      } else {
        const result = await next.build()
        if (result.exitCode !== 0) {
          throw new Error(
            'Failed to export Route Handlers:\n' + result.cliOutput
          )
        }
        server = createServer((request, response) =>
          serveHandler(request, response, {
            public: join(next.testDir, 'out'),
          })
        )
        await new Promise<void>((resolve) => server!.listen(0, resolve))
        origin = `http://localhost:${(server.address() as AddressInfo).port}`
      }
    })

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()))
      }
    })

    it.each([
      { route: '/api/static', message: 'Static GET' },
      { route: '/api/cached', message: 'Cached Route Handler' },
      { route: '/api/async-module', message: 'Async GET' },
      { route: '/api/unused-request', message: 'Unused request promise' },
    ])(
      'serves $route without legacy static opt-in',
      async ({ route, message }) => {
        const response = await fetch(origin + route)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ message })
        if (isNextStart) {
          expect(JSON.parse(await next.readFile('out' + route))).toEqual({
            message,
          })
        }
      }
    )

    it('exports a remote cache', async () => {
      const response = await fetch(origin + '/api/remote')
      expect(response.status).toBe(200)
      const value = await response.json()
      expect(value).toEqual({ value: expect.any(Number) })
      if (isNextStart) {
        expect(JSON.parse(await next.readFile('out/api/remote'))).toEqual(value)
      }
    })

    it.each([
      { route: '/api/stream', body: 'Static streamed body' },
      { route: '/api/cached-body', body: 'Cached Route Handler' },
    ])('exports the complete body of $route', async ({ route, body }) => {
      const response = await fetch(origin + route)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(body)
      if (isNextStart) {
        expect(await next.readFile('out' + route)).toBe(body)
      }
    })

    it('only serves generated handler parameters', async () => {
      for (const slug of ['first', 'second']) {
        const response = await fetch(origin + '/api/posts/' + slug)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ slug })
      }
      expect((await fetch(origin + '/api/posts/unknown')).status).toBe(404)
      if (isNextStart) {
        const manifest = await next.readJSON('.next/prerender-manifest.json')
        expect(manifest.dynamicRoutes['/api/posts/[slug]'].fallback).toBe(false)
        expect(manifest.routes['/api/posts/first']).toBeDefined()
        expect(await next.hasFile('out/api/posts/[slug]')).toBe(false)
        expect(
          JSON.parse(
            await next.readFile('.next/server/app/api/posts/first.body')
          )
        ).toEqual({ slug: 'first' })
        for (const suffix of ['body', 'meta']) {
          expect(
            await next.hasFile(`.next/server/app/api/posts/[slug].${suffix}`)
          ).toBe(false)
        }
      }
    })

    it('exports generated metadata routes', async () => {
      const robots = await fetch(origin + '/robots.txt')
      expect(robots.status).toBe(200)
      expect(await robots.text()).toContain('User-Agent: *\nAllow: /')
      const sitemap = await fetch(origin + '/sitemap.xml')
      expect(sitemap.status).toBe(200)
      expect(await sitemap.text()).toContain(
        '<loc>https://example.com/cc-static-export</loc>'
      )
      if (isNextStart) {
        expect(await next.hasFile('out/robots.txt')).toBe(true)
        expect(await next.hasFile('out/sitemap.xml')).toBe(true)
      }
    })

    it('exports a single sitemap with explicit parent matching', async () => {
      const pathname = '/single-map/en/sitemap.xml'
      const response = await fetch(origin + pathname)
      expect(response.status).toBe(200)
      const body = await response.text()
      expect(body).toContain(
        '<loc>https://cc-export-metadata.example/single-sitemap</loc>'
      )
      for (const lang of ['unknown', '-']) {
        expect(
          (await fetch(origin + `/single-map/${lang}/sitemap.xml`)).status
        ).toBe(404)
      }
      if (isNextStart) {
        expect(await next.readFile('out' + pathname)).toBe(body)
        expect(await next.hasFile('out/single-map/-/sitemap.xml')).toBe(false)
        const manifest = await next.readJSON('.next/prerender-manifest.json')
        expect(manifest.routes[pathname]?.srcRoute).toBe(
          '/single-map/[lang]/sitemap.xml'
        )
        expect(manifest.routes['/single-map/-/sitemap.xml']).toBeUndefined()
      }
    })

    it('exports generated metadata IDs with explicit parent matching', async () => {
      const imagePrefix = [137, 80, 78, 71, 13, 10, 26, 10]
      for (const id of ['known-small', 'known-large']) {
        const response = await fetch(
          origin + '/media/known/opengraph-image/' + id
        )
        expect(response.status).toBe(200)
        expect(
          Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 8))
        ).toEqual(imagePrefix)
      }
      for (const lang of ['en', 'ja']) {
        for (const id of ['0', 'blog']) {
          const response = await fetch(
            origin + `/maps/${lang}/sitemap/${id}.xml`
          )
          expect(response.status).toBe(200)
          expect(await response.text()).toContain(
            `<loc>https://cc-export-metadata.example/${id}</loc>`
          )
        }
      }
      for (const path of [
        '/media/unknown/opengraph-image/known-small',
        '/media/empty/opengraph-image/known-small',
        '/media/known/opengraph-image/unknown',
        '/maps/unknown/sitemap/0.xml',
        '/maps/en/sitemap/unknown.xml',
      ]) {
        expect((await fetch(origin + path)).status).toBe(404)
      }
      const icon = await fetch(origin + '/binary/-/icon.png')
      expect(icon.status).toBe(200)
      expect(
        Array.from(new Uint8Array(await icon.arrayBuffer()).slice(0, 8))
      ).toEqual(imagePrefix)
      if (isNextStart) {
        const manifest = await next.readJSON('.next/prerender-manifest.json')
        expect(
          manifest.routes['/media/known/opengraph-image/known-small']
        ).toBeDefined()
        expect(manifest.routes['/maps/en/sitemap/0.xml']).toBeDefined()
        expect(
          Object.keys(manifest.routes).filter((route) =>
            route.startsWith('/media/empty/')
          )
        ).toEqual([])
        expect(await next.hasFile('out/media/empty')).toBe(false)
        expect(await next.hasFile('out/binary/-/icon.png')).toBe(true)
      }
    })

    it.each([
      { route: '/api/not-found', status: 404, body: 'Static not found' },
      { route: '/api/no-content', status: 204, body: '' },
    ])(
      'exports the body and status metadata of $route',
      async ({ route, status, body }) => {
        const response = await fetch(origin + route)
        expect(response.status).toBe(isNextDev ? status : 200)
        expect(await response.text()).toBe(body)
        if (isNextStart) {
          const metadata = await next.readJSON(`.next/server/app${route}.meta`)
          expect(metadata.status).toBe(status)
          expect(await next.readFile('out' + route)).toBe(body)
        }
      }
    )

    // The framework automatically supplies these methods in dev. Static hosts
    // supply their own HTTP method behavior after export.
    // @force-gate dev
    it('allows automatically implemented HEAD and OPTIONS', async () => {
      expect((await next.fetch('/api/static', { method: 'HEAD' })).status).toBe(
        200
      )
      expect(
        (await next.fetch('/api/static', { method: 'OPTIONS' })).status
      ).toBe(204)
    })
    // The live userland getter must validate newly added methods after HMR.
    // @force-gate dev
    it('validates methods after a handler update', async () => {
      const file = 'app/api/static/route.ts'
      const original = await next.readFile(file)
      const outputStart = next.cliOutput.length
      try {
        await next.patchFile(
          file,
          original +
            '\nexport function POST() { return new Response("POST") }\n'
        )
        await retry(async () => {
          expect((await next.fetch('/api/static')).status).toBe(500)
        })
        expect(next.cliOutput.slice(outputStart)).toContain(
          'Only GET is supported'
        )
      } finally {
        await next.patchFile(file, original)
      }
      await retry(async () => {
        expect((await next.fetch('/api/static')).status).toBe(200)
      })
    })
  })

  describe('incomplete responses and unsupported methods', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'errors'),
      skipStart: !isNextDev,
    })

    let dataServer: Server | undefined

    beforeAll(async () => {
      if (isNextStart) {
        dataServer = createServer((request, response) => {
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify(
              request.url === '/image'
                ? [
                    {
                      id: 'image',
                      size: { width: 1, height: 1 },
                      contentType: 'image/png',
                    },
                  ]
                : request.url === '/sitemap'
                  ? [{ id: 0 }]
                  : { message: 'Uncached IO' }
            )
          )
        })
        await new Promise<void>((resolve) => dataServer!.listen(0, resolve))
        const { port } = dataServer.address() as AddressInfo
        await next.patchFile(
          '.env.local',
          `CC_EXPORT_DATA_URL=http://localhost:${port}\n`
        )
        const result = await next.build({
          args: ['--experimental-build-mode', 'compile', '--debug-prerender'],
        })
        if (result.exitCode !== 0) {
          throw new Error(
            'Failed to compile Route Handlers:\n' + result.cliOutput
          )
        }
      }
    })

    afterAll(async () => {
      if (dataServer) {
        await new Promise<void>((resolve) => dataServer!.close(() => resolve()))
      }
    })

    async function prerender(route: string) {
      const result = await next.build({
        args: [
          '--experimental-build-mode',
          'generate',
          '--debug-prerender',
          '--debug-build-paths',
          `app${route}/route.ts`,
        ],
      })
      expect(result.cliOutput).not.toContain('did not match any files')
      return result
    }

    it.each([
      ...methods.map((method) => ({
        route: '/api/' + method.toLowerCase(),
        method,
      })),
      { route: '/api/async-method', method: 'POST' },
      { route: '/api/post-only', method: 'POST' },
    ])(
      'rejects the explicit $method export in $route',
      async ({ route, method }) => {
        let output: string
        if (isNextDev) {
          const start = next.cliOutput.length
          expect((await next.fetch(route)).status).toBe(500)
          await retry(async () => {
            expect(next.cliOutput.slice(start)).toContain(
              'Only GET is supported'
            )
          })

          output = next.cliOutput.slice(start)
        } else {
          const result = await prerender(route)
          expect(result.exitCode).toBe(1)
          output = result.cliOutput
        }
        expect(output).toContain(`Route "${route}"`)
        expect(output).toContain(`"output: export": ${method}`)
        expect(output).toContain('Only GET is supported')
      }
    )

    it.each(['omitted', 'dynamic', 'blocking', 'fallback'])(
      'rejects %s matching for a concrete handler export',
      async (mode) => {
        const route = `/api/matching-${mode}/known`
        let output: string
        if (isNextDev) {
          const start = next.cliOutput.length
          expect((await next.fetch(route)).status).toBe(500)
          await retry(async () => {
            expect(next.cliOutput.slice(start)).toMatch(
              /must configure parameter "slug" as "not-found"/
            )
          })
          output = next.cliOutput.slice(start)
        } else {
          const result = await prerender(`/api/matching-${mode}/[slug]`)
          expect(result.exitCode).toBe(1)
          output = result.cliOutput
        }
        expect(output).toMatch(
          /must configure parameter "slug" as "not-found".*"output: export"/
        )
      }
    )

    // Metadata generators are checked by the same handler prerender as their bodies.
    // @force-gate start
    describe('metadata enumeration', () => {
      it.each([
        {
          source: 'app/authored-metadata/[__metadata_id__]/opengraph-image.tsx',
          param: '__metadata_id__',
        },
        {
          source: 'app/sitemap/[__metadata_id__]/route.ts',
          param: '__metadata_id__',
        },
        {
          source: 'app/files/[slug]/icon.png/route.ts',
          param: 'slug',
        },
        {
          source: 'app/open-parent/[slug]/opengraph-image.tsx',
          param: 'slug',
        },
      ])(
        'requires authored parameter matching for $source',
        async ({ source, param }) => {
          const result = await next.build({
            args: [
              '--experimental-build-mode',
              'generate',
              '--debug-prerender',
              '--debug-build-paths',
              source,
            ],
          })
          expect(result.cliOutput).not.toContain('did not match any files')
          expect(result.exitCode).toBe(1)
          expect(result.cliOutput).toContain(
            `must configure parameter "${param}" as "not-found"`
          )
          expect(result.cliOutput).toContain('"output: export"')
        }
      )

      it.each([
        [
          'uncached-image',
          'opengraph-image.tsx',
          '/uncached-image/opengraph-image/[__metadata_id__]',
        ],
        [
          'uncached-sitemap',
          'sitemap.ts',
          '/uncached-sitemap/sitemap/[__metadata_id__]',
        ],
      ])(
        'rejects uncached metadata enumeration in %s',
        async (directory, filename, route) => {
          const result = await next.build({
            args: [
              '--experimental-build-mode',
              'generate',
              '--debug-prerender',
              '--debug-build-paths',
              `app/${directory}/${filename}`,
            ],
          })
          expect(result.cliOutput).not.toContain('did not match any files')
          expect(result.exitCode).toBe(1)
          expect(result.cliOutput).toContain(`Route "${route}"`)
          expect(result.cliOutput).toContain(
            'could not be statically exported with "output: export"'
          )
        }
      )
    })

    // Uncached handler IO is validated during build-time prerendering.
    // @force-gate start
    describe('build-time completeness', () => {
      it.each([
        '/api/connection',
        '/api/headers',
        '/api/cookies',
        '/api/next-url',
        '/api/request-body',
        '/api/uncached',
        '/api/unused-request-and-uncached',
        '/api/blocked-body',
        '/api/partial-body',
        '/api/async-dynamic',
        '/api/short-cache',
        '/api/sync-io',
        '/api/error-status',
      ])('fails the export instead of omitting %s', async (route) => {
        const result = await prerender(route)
        expect(result.exitCode).toBe(1)
        expect(result.cliOutput).toContain(
          `Route "${route}" could not be statically exported with "output: export"`
        )
        if (route === '/api/unused-request-and-uncached') {
          expect(result.cliOutput).not.toContain('used `headers()`')
        }
      })
    })
  })
})
