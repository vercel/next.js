import type * as Playwright from 'playwright'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import { join } from 'path'
import { isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import { retry, waitForNoRedbox } from 'next-test-utils'
import * as cheerio from 'cheerio'
import { createExportServer } from './server.mjs'

// This suite builds and mounts out/ on an ordinary static file server.
// @force-gate !deploy
describe('Cache Components static export', () => {
  describe.each([
    { partialPrefetching: false, trailingSlash: false, basePath: '' },
    { partialPrefetching: true, trailingSlash: false, basePath: '' },
    { partialPrefetching: false, trailingSlash: true, basePath: '/docs' },
    { partialPrefetching: true, trailingSlash: true, basePath: '/docs' },
  ])('configuration: %p', (config) => {
    const { partialPrefetching, trailingSlash, basePath } = config
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      disableAutoSkewProtection: true,
      dependencies: {
        '@types/react': '19.2.18',
        '@types/react-dom': '19.2.4',
      },
    })
    let server: Server | undefined
    let port: number | undefined
    let origin: string
    let buildOutput: string

    const routePath = (pathname: string) =>
      basePath + pathname + (trailingSlash && pathname !== '/' ? '/' : '')

    beforeAll(async () => {
      await next.patchFile(
        'next.config.ts',
        `export default ${JSON.stringify({
          output: 'export',
          cacheComponents: true,
          experimental: { optimisticRouting: true },
          ...config,
        })}`
      )
      if (isNextDev) {
        await next.start()
        origin = next.url
      } else {
        const { cliOutput, exitCode } = await next.build()
        if (exitCode !== 0) {
          throw new Error(
            'Failed to build static export fixtures:\n' + cliOutput
          )
        }
        buildOutput = cliOutput
        server = createExportServer(join(next.testDir, 'out'), {
          basePath,
          trailingSlash,
        })
        await new Promise<void>((resolve) => server!.listen(0, resolve))
        port = (server.address() as AddressInfo).port
        origin = `http://localhost:${port}`
      }
    })

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()))
      }
    })

    it('exports cached data, remote caches, and metadata', async () => {
      const response = await fetch(origin + routePath('/'))
      expect(response.status).toBe(200)
      const $ = cheerio.load(await response.text())
      expect($('#cached').text()).toMatch(/^Cached: \d/)
      expect($('#remote').text()).toMatch(/^Remote: \d/)
      expect($('title').text()).toBe('Cache Components export')
      expect($('meta[name="description"]').attr('content')).toBe(
        'A complete static deployment'
      )
    })

    it.each([
      '/browser-only',
      '/empty-shell',
      '/unused-request',
      '/weaker-policy',
    ])('allows a complete server result for %s', async (pathname) => {
      expect((await fetch(origin + routePath(pathname))).status).toBe(200)
      const browser = await next.browser(routePath(pathname), { baseUrl: port })
      if (pathname === '/browser-only' || pathname === '/empty-shell') {
        expect(await browser.elementById('browser').text()).toBe(
          'Browser-only content'
        )
      } else if (pathname === '/unused-request') {
        expect(await browser.elementById('unused').text()).toBe(
          'Unused request promise'
        )
      } else {
        expect(await browser.elementById('weaker').text()).toBe(
          'A weaker authored policy still produces a complete export'
        )
      }
      await waitForNoRedbox(browser)
    })

    it('only serves generated concrete parameters', async () => {
      for (const slug of ['first', 'second']) {
        const response = await fetch(origin + routePath(`/posts/${slug}`))
        expect(response.status).toBe(200)
        const $ = cheerio.load(await response.text())
        expect($('#post').text()).toBe(`Post: ${slug}`)
      }
      expect((await fetch(origin + routePath('/posts/unknown'))).status).toBe(
        404
      )

      if (isNextStart) {
        expect(buildOutput).toMatch(/○\s+\/posts\/first/)
        expect(buildOutput).toMatch(/○\s+\/posts\/second/)
        expect(buildOutput).not.toMatch(/ƒ\s+\/(?:posts|empty-shell)/)
        const manifest = await next.readJSON('.next/prerender-manifest.json')
        expect(manifest.dynamicRoutes['/posts/[slug]'].fallback).toBe(false)
        expect(manifest.routes['/posts/first']).toBeDefined()
        expect(manifest.routes['/posts/[slug]']).toBeUndefined()
        for (const suffix of ['html', 'rsc', 'meta', 'segments']) {
          expect(
            await next.hasFile(`.next/server/app/posts/[slug].${suffix}`)
          ).toBe(false)
        }
        expect(await next.hasFile('out/404.html')).toBe(true)
        expect(await next.hasFile('out/posts/[slug].html')).toBe(false)
        expect(await next.hasFile('out/posts/[slug].txt')).toBe(false)
        expect(await next.hasFile('out/posts/[slug]')).toBe(false)
      }
    })

    it('supports explicit not-found parameter matching', async () => {
      const response = await fetch(origin + routePath('/matched/known'))
      expect(response.status).toBe(200)
      const $ = cheerio.load(await response.text())
      expect($('#matched').text()).toBe('Matched: known')
      expect((await fetch(origin + routePath('/matched/unknown'))).status).toBe(
        404
      )
      if (isNextStart) {
        const manifest = await next.readJSON('.next/prerender-manifest.json')
        expect(manifest.dynamicRoutes['/matched/[slug]'].fallback).toBe(false)
        expect(manifest.routes['/matched/known']).toBeDefined()
        expect(await next.hasFile('out/matched/[slug].html')).toBe(false)
      }
    })

    it('exports optional catchalls and nested generated parameters', async () => {
      const routes = [
        { pathname: '/optional', id: 'optional', text: 'Optional: root' },
        {
          pathname: '/optional/nested/path',
          id: 'optional',
          text: 'Optional: nested/path',
        },
        ...['en', 'ja'].map((lang) => ({
          pathname: `/nested/${lang}/posts/${lang}-first`,
          id: 'nested',
          text: `Nested: ${lang}/${lang}-first`,
        })),
      ]
      for (const { pathname, id, text } of routes) {
        const response = await fetch(origin + routePath(pathname))
        expect(response.status).toBe(200)
        const $ = cheerio.load(await response.text())
        expect($('#' + id).text()).toBe(text)
      }
      for (const pathname of [
        '/optional/unknown',
        '/nested/en/posts/unknown',
      ]) {
        expect((await fetch(origin + routePath(pathname))).status).toBe(404)
      }
      if (isNextStart) {
        const manifest = await next.readJSON('.next/prerender-manifest.json')
        for (const { pathname } of routes) {
          expect(manifest.routes[pathname]).toBeDefined()
        }
        for (const pattern of [
          '/optional/[[...parts]]',
          '/nested/[lang]/posts/[slug]',
        ]) {
          expect(manifest.dynamicRoutes[pattern].fallback).toBe(false)
          expect(manifest.routes[pattern]).toBeUndefined()
          expect(await next.hasFile(`out${pattern}`)).toBe(false)
          for (const suffix of ['html', 'rsc', 'meta', 'segments']) {
            expect(
              await next.hasFile(`.next/server/app${pattern}.${suffix}`)
            ).toBe(false)
          }
        }
      }
    })

    // Prefetching requires production; dev validates the same pages above.
    // @force-gate start
    describe('static-host prefetching', () => {
      it('does not reuse a generated sibling for an ungenerated parameter', async () => {
        const requiredFiles = await next.readJSON(
          '.next/required-server-files.json'
        )
        expect(requiredFiles.config.experimental.optimisticRouting).toBe(true)
        let act: ReturnType<typeof createRouterAct>
        const browser = await next.browser(routePath('/'), {
          baseUrl: port,
          beforePageLoad(page: Playwright.Page) {
            act = createRouterAct(page, { includeAppShellRequests: true })
          },
        })
        await browser.eval('window.__navigationMarker = "preserved"')
        await act(
          () =>
            browser
              .elementByCss('[data-link-accordion="/unread/known"]')
              .click(),
          { includes: 'A generated route that does not read params' }
        )
        await act(
          () =>
            browser
              .elementByCss(`a[href="${routePath('/unread/known')}"]`)
              .click(),
          'no-requests'
        )
        expect(await browser.elementById('unread').text()).toBe(
          'A generated route that does not read params'
        )
        expect(await browser.eval('window.__navigationMarker')).toBe(
          'preserved'
        )
        await act(
          () =>
            browser
              .elementByCss('[data-link-accordion="/unread/unknown"]')
              .click(),
          'no-requests'
        )
        await browser
          .elementByCss(`a[href="${routePath('/unread/unknown')}"]`)
          .click()
        await retry(async () => {
          expect(
            await browser.eval(
              () => document.querySelector('#unknown-export-route')?.textContent
            )
          ).toBe('Unknown export route')
        })
        expect(
          await browser.eval(() => document.querySelector('#unread'))
        ).toBe(null)
        expect(new URL(await browser.url()).pathname).toBe(
          routePath('/unread/unknown')
        )
      })

      it.each([
        { pathname: '/posts/first', prefetch: 'default', text: 'Post: first' },
        { pathname: '/posts/second', prefetch: 'full', text: 'Post: second' },
        {
          pathname: '/staged',
          prefetch: 'navigation',
          text: 'Cached navigation content',
        },
        {
          pathname: '/browser-only',
          prefetch: 'disabled',
          text: 'Loading browser content...',
        },
      ])(
        'navigates with $prefetch prefetching',
        async ({ pathname, prefetch, text }) => {
          let act: ReturnType<typeof createRouterAct>
          const requests: string[] = []
          const browser = await next.browser(routePath('/'), {
            baseUrl: port,
            beforePageLoad(page: Playwright.Page) {
              act = createRouterAct(page, { includeAppShellRequests: true })
              page.on('request', (request) => {
                if (request.headers()['rsc'])
                  requests.push(new URL(request.url()).pathname)
              })
            },
          })
          await browser.eval('window.__navigationMarker = "preserved"')
          const reveal = async () => {
            await browser
              .elementByCss(`[data-link-accordion="${pathname}"]`)
              .click()
          }
          const navigate = async () => {
            await browser
              .elementByCss(`a[href="${routePath(pathname)}"]`)
              .click()
          }

          if (prefetch === 'disabled') {
            await act(reveal, 'no-requests')
            await act(navigate, { includes: text })
          } else {
            await act(reveal, { includes: text })
            await act(navigate, 'no-requests')
          }

          const id =
            pathname === '/staged'
              ? 'navigation'
              : pathname === '/browser-only'
                ? 'browser'
                : 'post'
          expect(await browser.elementById(id).text()).toBe(
            pathname === '/browser-only' ? 'Browser-only content' : text
          )
          if (pathname === '/staged') {
            expect(await browser.elementById('prefetch').text()).toBe(
              'Prefetch content'
            )
          }
          expect(await browser.eval('window.__navigationMarker')).toBe(
            'preserved'
          )
          expect(requests.length).toBeGreaterThan(0)
          expect(
            requests.every(
              (url) => url.startsWith(basePath + '/') && url.endsWith('.txt')
            )
          ).toBe(true)
          if (!partialPrefetching && prefetch === 'full') {
            expect(requests).toContain(
              basePath + '/posts/second/__next._full.txt'
            )
          }
        }
      )
    })
  })
})
