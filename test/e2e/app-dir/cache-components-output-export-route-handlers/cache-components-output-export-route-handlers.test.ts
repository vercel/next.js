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

    beforeAll(async () => {
      if (isNextStart) {
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
