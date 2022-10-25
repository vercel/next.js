import { createNext, FileRef } from 'e2e-utils'
import crypto from 'crypto'
import { NextInstance } from 'test/lib/next-modes/base'
import {
  check,
  fetchViaHTTP,
  getRedboxHeader,
  hasRedbox,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'
import path from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'

describe('app dir', () => {
  const isDev = (global as any).isNextDev
  let next: NextInstance

  function runTests() {
    beforeAll(async () => {
      next = await createNext({
        files: new FileRef(path.join(__dirname, 'app')),
        dependencies: {
          swr: '2.0.0-rc.0',
          react: 'latest',
          'react-dom': 'latest',
          sass: 'latest',
        },
        skipStart: true,
      })

      await next.start()
    })
    afterAll(() => next.destroy())

    it('should not share edge workers', async () => {
      const controller1 = new AbortController()
      const controller2 = new AbortController()
      fetchViaHTTP(next.url, '/slow-page-no-loading', undefined, {
        signal: controller1.signal,
      }).catch(() => {})
      fetchViaHTTP(next.url, '/slow-page-no-loading', undefined, {
        signal: controller2.signal,
      }).catch(() => {})

      await waitFor(1000)
      controller1.abort()

      const controller3 = new AbortController()
      fetchViaHTTP(next.url, '/slow-page-no-loading', undefined, {
        signal: controller3.signal,
      }).catch(() => {})
      await waitFor(1000)
      controller2.abort()
      controller3.abort()

      const res = await fetchViaHTTP(next.url, '/slow-page-no-loading')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('hello from slow page')
      expect(next.cliOutput).not.toContain(
        'A separate worker must be used for each render'
      )
    })

    if ((global as any).isNextStart) {
      it('should generate build traces correctly', async () => {
        const trace = JSON.parse(
          await next.readFile(
            '.next/server/app/dashboard/deployments/[id]/page.js.nft.json'
          )
        ) as { files: string[] }
        expect(trace.files.some((file) => file.endsWith('data.json'))).toBe(
          true
        )
      })
    }

    it('should use application/octet-stream for flight', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/dashboard/deployments/123',
        {},
        {
          headers: {
            __rsc__: '1',
          },
        }
      )
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream')
    })

    it('should use application/octet-stream for flight with edge runtime', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/dashboard',
        {},
        {
          headers: {
            __rsc__: '1',
          },
        }
      )
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream')
    })

    it('should pass props from getServerSideProps in root layout', async () => {
      const html = await renderViaHTTP(next.url, '/dashboard')
      const $ = cheerio.load(html)
      expect($('title').text()).toBe('hello world')
    })

    it('should serve from pages', async () => {
      const html = await renderViaHTTP(next.url, '/')
      expect(html).toContain('hello from pages/index')

      // esm imports should work fine in pages/
      expect(html).toContain('swr-index')
    })

    it('should serve dynamic route from pages', async () => {
      const html = await renderViaHTTP(next.url, '/blog/first')
      expect(html).toContain('hello from pages/blog/[slug]')
    })

    it('should serve from public', async () => {
      const html = await renderViaHTTP(next.url, '/hello.txt')
      expect(html).toContain('hello world')
    })

    it('should serve from app', async () => {
      const html = await renderViaHTTP(next.url, '/dashboard')
      expect(html).toContain('hello from app/dashboard')
    })

    if (!(global as any).isNextDeploy) {
      it('should serve /index as separate page', async () => {
        const html = await renderViaHTTP(next.url, '/dashboard/index')
        expect(html).toContain('hello from app/dashboard/index')
        // should load chunks generated via async import correctly with React.lazy
        expect(html).toContain('hello from lazy')
        // should support `dynamic` in both server and client components
        expect(html).toContain('hello from dynamic on server')
        expect(html).toContain('hello from dynamic on client')
      })

      it('should serve polyfills for browsers that do not support modules', async () => {
        const html = await renderViaHTTP(next.url, '/dashboard/index')
        expect(html).toMatch(
          /<script src="\/_next\/static\/chunks\/polyfills(-\w+)?\.js" nomodule="">/
        )
      })
    }

    // TODO-APP: handle css modules fouc in dev
    it.skip('should handle css imports in next/dynamic correctly', async () => {
      const browser = await webdriver(next.url, '/dashboard/index')

      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#css-text-dynamic-server')).color`
        )
      ).toBe('rgb(0, 0, 255)')
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#css-text-lazy')).color`
        )
      ).toBe('rgb(128, 0, 128)')
    })

    it('should include layouts when no direct parent layout', async () => {
      const html = await renderViaHTTP(next.url, '/dashboard/integrations')
      const $ = cheerio.load(html)
      // Should not be nested in dashboard
      expect($('h1').text()).toBe('Dashboard')
      // Should include the page text
      expect($('p').text()).toBe('hello from app/dashboard/integrations')
    })

    // TODO-APP: handle new root layout
    it.skip('should not include parent when not in parent directory with route in directory', async () => {
      const html = await renderViaHTTP(next.url, '/dashboard/hello')
      const $ = cheerio.load(html)

      // new root has to provide it's own custom root layout or the default
      // is used instead
      expect(html).toContain('<html')
      expect(html).toContain('<body')
      expect($('html').hasClass('this-is-the-document-html')).toBeFalsy()
      expect($('body').hasClass('this-is-the-document-body')).toBeFalsy()

      // Should not be nested in dashboard
      expect($('h1').text()).toBeFalsy()

      // Should render the page text
      expect($('p').text()).toBe('hello from app/dashboard/rootonly/hello')
    })

    it('should use new root layout when provided', async () => {
      const html = await renderViaHTTP(next.url, '/dashboard/another')
      const $ = cheerio.load(html)

      // new root has to provide it's own custom root layout or the default
      // is used instead
      expect($('html').hasClass('this-is-another-document-html')).toBeTruthy()
      expect($('body').hasClass('this-is-another-document-body')).toBeTruthy()

      // Should not be nested in dashboard
      expect($('h1').text()).toBeFalsy()

      // Should render the page text
      expect($('p').text()).toBe('hello from newroot/dashboard/another')
    })

    it('should not create new root layout when nested (optional)', async () => {
      const html = await renderViaHTTP(
        next.url,
        '/dashboard/deployments/breakdown'
      )
      const $ = cheerio.load(html)

      // new root has to provide it's own custom root layout or the default
      // is used instead
      expect($('html').hasClass('this-is-the-document-html')).toBeTruthy()
      expect($('body').hasClass('this-is-the-document-body')).toBeTruthy()

      // Should be nested in dashboard
      expect($('h1').text()).toBe('Dashboard')
      expect($('h2').text()).toBe('Custom dashboard')

      // Should render the page text
      expect($('p').text()).toBe(
        'hello from app/dashboard/(custom)/deployments/breakdown'
      )
    })

    it('should include parent document when no direct parent layout', async () => {
      const html = await renderViaHTTP(next.url, '/dashboard/integrations')
      const $ = cheerio.load(html)

      expect($('html').hasClass('this-is-the-document-html')).toBeTruthy()
      expect($('body').hasClass('this-is-the-document-body')).toBeTruthy()
    })

    it('should not include parent when not in parent directory', async () => {
      const html = await renderViaHTTP(next.url, '/dashboard/changelog')
      const $ = cheerio.load(html)
      // Should not be nested in dashboard
      expect($('h1').text()).toBeFalsy()
      // Should include the page text
      expect($('p').text()).toBe('hello from app/dashboard/changelog')
    })

    it('should serve nested parent', async () => {
      const html = await renderViaHTTP(next.url, '/dashboard/deployments/123')
      const $ = cheerio.load(html)
      // Should be nested in dashboard
      expect($('h1').text()).toBe('Dashboard')
      // Should be nested in deployments
      expect($('h2').text()).toBe('Deployments hello')
    })

    it('should serve dynamic parameter', async () => {
      const html = await renderViaHTTP(next.url, '/dashboard/deployments/123')
      const $ = cheerio.load(html)
      // Should include the page text with the parameter
      expect($('p').text()).toBe(
        'hello from app/dashboard/deployments/[id]. ID is: 123'
      )
    })

    it('should include document html and body', async () => {
      const html = await renderViaHTTP(next.url, '/dashboard')
      const $ = cheerio.load(html)

      expect($('html').hasClass('this-is-the-document-html')).toBeTruthy()
      expect($('body').hasClass('this-is-the-document-body')).toBeTruthy()
    })

    it('should not serve when layout is provided but no folder index', async () => {
      const res = await fetchViaHTTP(next.url, '/dashboard/deployments')
      expect(res.status).toBe(404)
      expect(await res.text()).toContain('This page could not be found')
    })

    // TODO-APP: do we want to make this only work for /root or is it allowed
    // to work for /pages as well?
    it.skip('should match partial parameters', async () => {
      const html = await renderViaHTTP(next.url, '/partial-match-123')
      expect(html).toContain('hello from app/partial-match-[id]. ID is: 123')
    })

    // This is a workaround to fix https://github.com/vercel/next.js/issues/5860
    // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
    it('should use cache busting when loading css (dev only)', async () => {
      const html = await renderViaHTTP(next.url, '/')
      const $ = cheerio.load(html)
      const links = $('link[rel=stylesheet]')
      links.each((_, link) => {
        const href = $(link).attr('href')
        isDev
          ? expect(href).toMatch(/\?ts=/)
          : expect(href).not.toMatch(/\?ts=/)
      })
    })

    describe('rewrites', () => {
      // TODO-APP: rewrite url is broken
      it('should support rewrites on initial load', async () => {
        const browser = await webdriver(next.url, '/rewritten-to-dashboard')
        expect(await browser.elementByCss('h1').text()).toBe('Dashboard')
        expect(await browser.url()).toBe(`${next.url}/rewritten-to-dashboard`)
      })

      it('should support rewrites on client-side navigation from pages to app with existing pages path', async () => {
        const browser = await webdriver(next.url, '/link-to-rewritten-path')

        try {
          // Click the link.
          await browser.elementById('link-to-rewritten-path').click()
          await browser.waitForElementByCss('#from-dashboard')

          // Check to see that we were rewritten and not redirected.
          // TODO-APP: rewrite url is broken
          // expect(await browser.url()).toBe(`${next.url}/rewritten-to-dashboard`)

          // Check to see that the page we navigated to is in fact the dashboard.
          expect(await browser.elementByCss('#from-dashboard').text()).toBe(
            'hello from app/dashboard'
          )
        } finally {
          await browser.close()
        }
      })

      it('should support rewrites on client-side navigation', async () => {
        const browser = await webdriver(next.url, '/rewrites')

        try {
          // Click the link.
          await browser.elementById('link').click()
          await browser.waitForElementByCss('#from-dashboard')

          // Check to see that we were rewritten and not redirected.
          expect(await browser.url()).toBe(`${next.url}/rewritten-to-dashboard`)

          // Check to see that the page we navigated to is in fact the dashboard.
          expect(await browser.elementByCss('#from-dashboard').text()).toBe(
            'hello from app/dashboard'
          )
        } finally {
          await browser.close()
        }
      })
    })

    // TODO-APP: Enable in development
    ;(isDev ? it.skip : it)(
      'should not rerender layout when navigating between routes in the same layout',
      async () => {
        const browser = await webdriver(next.url, '/same-layout/first')

        try {
          // Get the render id from the dom and click the first link.
          const firstRenderID = await browser.elementById('render-id').text()
          await browser.elementById('link').click()
          await browser.waitForElementByCss('#second-page')

          // Get the render id from the dom again, it should be the same!
          const secondRenderID = await browser.elementById('render-id').text()
          expect(secondRenderID).toBe(firstRenderID)

          // Navigate back to the first page again by clicking the link.
          await browser.elementById('link').click()
          await browser.waitForElementByCss('#first-page')

          // Get the render id from the dom again, it should be the same!
          const thirdRenderID = await browser.elementById('render-id').text()
          expect(thirdRenderID).toBe(firstRenderID)
        } finally {
          await browser.close()
        }
      }
    )

    it('should handle hash in initial url', async () => {
      const browser = await webdriver(next.url, '/dashboard#abc')

      try {
        // Check if hash is preserved
        expect(await browser.eval('window.location.hash')).toBe('#abc')
        await waitFor(1000)
        // Check again to be sure as it might be timed different
        expect(await browser.eval('window.location.hash')).toBe('#abc')
      } finally {
        await browser.close()
      }
    })

    describe('parallel routes', () => {
      if (!(global as any).isNextDeploy) {
        it('should match parallel routes', async () => {
          const html = await renderViaHTTP(next.url, '/parallel/nested')
          expect(html).toContain('parallel/layout')
          expect(html).toContain('parallel/@foo/nested/layout')
          expect(html).toContain('parallel/@foo/nested/@a/page')
          expect(html).toContain('parallel/@foo/nested/@b/page')
          expect(html).toContain('parallel/@bar/nested/layout')
          expect(html).toContain('parallel/@bar/nested/@a/page')
          expect(html).toContain('parallel/@bar/nested/@b/page')
          expect(html).toContain('parallel/nested/page')
        })
      }

      it('should match parallel routes in route groups', async () => {
        const html = await renderViaHTTP(next.url, '/parallel/nested-2')
        expect(html).toContain('parallel/layout')
        expect(html).toContain('parallel/(new)/layout')
        expect(html).toContain('parallel/(new)/@baz/nested/page')
      })
    })

    describe('<Link />', () => {
      it('should hard push', async () => {
        const browser = await webdriver(next.url, '/link-hard-push/123')

        try {
          // Click the link on the page, and verify that the history entry was
          // added.
          expect(await browser.eval('window.history.length')).toBe(2)
          await browser.elementById('link').click()
          await browser.waitForElementByCss('#render-id-456')
          expect(await browser.eval('window.history.length')).toBe(3)

          // Get the id on the rendered page.
          const firstID = await browser.elementById('render-id-456').text()

          // Go back, and redo the navigation by clicking the link.
          await browser.back()
          await browser.elementById('link').click()
          await browser.waitForElementByCss('#render-id-456')

          // Get the id again, and compare, they should not be the same.
          const secondID = await browser.elementById('render-id-456').text()
          expect(secondID).not.toBe(firstID)
        } finally {
          await browser.close()
        }
      })

      it('should hard replace', async () => {
        const browser = await webdriver(next.url, '/link-hard-replace/123')

        try {
          // Click the link on the page, and verify that the history entry was NOT
          // added.
          expect(await browser.eval('window.history.length')).toBe(2)
          await browser.elementById('link').click()
          await browser.waitForElementByCss('#render-id-456')
          expect(await browser.eval('window.history.length')).toBe(2)

          // Get the date again, and compare, they should not be the same.
          const firstId = await browser.elementById('render-id-456').text()

          // Navigate to the subpage, verify that the history entry was NOT added.
          await browser.elementById('link').click()
          await browser.waitForElementByCss('#render-id-123')
          expect(await browser.eval('window.history.length')).toBe(2)

          // Navigate back again, verify that the history entry was NOT added.
          await browser.elementById('link').click()
          await browser.waitForElementByCss('#render-id-456')
          expect(await browser.eval('window.history.length')).toBe(2)

          // Get the date again, and compare, they should not be the same.
          const secondId = await browser.elementById('render-id-456').text()
          expect(firstId).not.toBe(secondId)
        } finally {
          await browser.close()
        }
      })

      // TODO-APP: Re-enable this test.
      it('should soft push', async () => {
        const browser = await webdriver(next.url, '/link-soft-push')

        try {
          // Click the link on the page, and verify that the history entry was
          // added.
          expect(await browser.eval('window.history.length')).toBe(2)
          await browser.elementById('link').click()
          await browser.waitForElementByCss('#render-id')
          expect(await browser.eval('window.history.length')).toBe(3)

          // Get the id on the rendered page.
          const firstID = await browser.elementById('render-id').text()

          // Go back, and redo the navigation by clicking the link.
          await browser.back()
          await browser.elementById('link').click()

          // Get the date again, and compare, they should be the same.
          const secondID = await browser.elementById('render-id').text()
          expect(firstID).toBe(secondID)
        } finally {
          await browser.close()
        }
      })

      // TODO-APP: investigate this test
      it.skip('should soft replace', async () => {
        const browser = await webdriver(next.url, '/link-soft-replace')

        try {
          // Get the render ID so we can compare it.
          const firstID = await browser.elementById('render-id').text()

          // Click the link on the page, and verify that the history entry was NOT
          // added.
          expect(await browser.eval('window.history.length')).toBe(2)
          await browser.elementById('self-link').click()
          await browser.waitForElementByCss('#render-id')
          expect(await browser.eval('window.history.length')).toBe(2)

          // Get the id on the rendered page.
          const secondID = await browser.elementById('render-id').text()
          expect(secondID).toBe(firstID)

          // Navigate to the subpage, verify that the history entry was NOT added.
          await browser.elementById('subpage-link').click()
          await browser.waitForElementByCss('#back-link')
          expect(await browser.eval('window.history.length')).toBe(2)

          // Navigate back again, verify that the history entry was NOT added.
          await browser.elementById('back-link').click()
          await browser.waitForElementByCss('#render-id')
          expect(await browser.eval('window.history.length')).toBe(2)

          // Get the date again, and compare, they should be the same.
          const thirdID = await browser.elementById('render-id').text()
          expect(thirdID).toBe(firstID)
        } finally {
          await browser.close()
        }
      })

      it('should be soft for back navigation', async () => {
        const browser = await webdriver(next.url, '/with-id')

        try {
          // Get the id on the rendered page.
          const firstID = await browser.elementById('render-id').text()

          // Click the link, and go back.
          await browser.elementById('link').click()
          await browser.waitForElementByCss('#from-navigation')
          await browser.back()

          // Get the date again, and compare, they should be the same.
          const secondID = await browser.elementById('render-id').text()
          expect(firstID).toBe(secondID)
        } finally {
          await browser.close()
        }
      })

      it('should be soft for forward navigation', async () => {
        const browser = await webdriver(next.url, '/with-id')

        try {
          // Click the link.
          await browser.elementById('link').click()
          await browser.waitForElementByCss('#from-navigation')

          // Get the id on the rendered page.
          const firstID = await browser.elementById('render-id').text()

          // Go back, then forward.
          await browser.back()
          await browser.forward()

          // Get the date again, and compare, they should be the same.
          const secondID = await browser.elementById('render-id').text()
          expect(firstID).toBe(secondID)
        } finally {
          await browser.close()
        }
      })

      it('should allow linking from app page to pages page', async () => {
        const browser = await webdriver(next.url, '/pages-linking')

        try {
          // Click the link.
          await browser.elementById('app-link').click()
          expect(await browser.waitForElementByCss('#pages-link').text()).toBe(
            'To App Page'
          )

          // Click the other link.
          await browser.elementById('pages-link').click()
          expect(await browser.waitForElementByCss('#app-link').text()).toBe(
            'To Pages Page'
          )
        } finally {
          await browser.close()
        }
      })
    })

    describe('server components', () => {
      // TODO-APP: why is this not servable but /dashboard+rootonly/hello.server.js
      // should be? Seems like they both either should be servable or not
      it('should not serve .server.js as a path', async () => {
        // Without .server.js should serve
        const html = await renderViaHTTP(next.url, '/should-not-serve-server')
        expect(html).toContain('hello from app/should-not-serve-server')

        // Should not serve `.server`
        const res = await fetchViaHTTP(
          next.url,
          '/should-not-serve-server.server'
        )
        expect(res.status).toBe(404)
        expect(await res.text()).toContain('This page could not be found')

        // Should not serve `.server.js`
        const res2 = await fetchViaHTTP(
          next.url,
          '/should-not-serve-server.server.js'
        )
        expect(res2.status).toBe(404)
        expect(await res2.text()).toContain('This page could not be found')
      })

      it('should not serve .client.js as a path', async () => {
        // Without .client.js should serve
        const html = await renderViaHTTP(next.url, '/should-not-serve-client')
        expect(html).toContain('hello from app/should-not-serve-client')

        // Should not serve `.client`
        const res = await fetchViaHTTP(
          next.url,
          '/should-not-serve-client.client'
        )
        expect(res.status).toBe(404)
        expect(await res.text()).toContain('This page could not be found')

        // Should not serve `.client.js`
        const res2 = await fetchViaHTTP(
          next.url,
          '/should-not-serve-client.client.js'
        )
        expect(res2.status).toBe(404)
        expect(await res2.text()).toContain('This page could not be found')
      })

      it('should serve shared component', async () => {
        // Without .client.js should serve
        const html = await renderViaHTTP(next.url, '/shared-component-route')
        expect(html).toContain('hello from app/shared-component-route')
      })

      describe('dynamic routes', () => {
        it('should only pass params that apply to the layout', async () => {
          const html = await renderViaHTTP(
            next.url,
            '/dynamic/books/hello-world'
          )
          const $ = cheerio.load(html)

          expect($('#dynamic-layout-params').text()).toBe('{}')
          expect($('#category-layout-params').text()).toBe(
            '{"category":"books"}'
          )
          expect($('#id-layout-params').text()).toBe(
            '{"category":"books","id":"hello-world"}'
          )
          expect($('#id-page-params').text()).toBe(
            '{"category":"books","id":"hello-world"}'
          )
        })
      })

      describe('catch-all routes', () => {
        it('should handle optional segments', async () => {
          const params = ['this', 'is', 'a', 'test']
          const route = params.join('/')
          const html = await renderViaHTTP(
            next.url,
            `/catch-all-optional/${route}`
          )
          const $ = cheerio.load(html)
          expect($('#text').attr('data-params')).toBe(route)
        })

        it('should handle optional segments root', async () => {
          const html = await renderViaHTTP(next.url, `/catch-all-optional`)
          const $ = cheerio.load(html)
          expect($('#text').attr('data-params')).toBe('')
        })

        it('should handle optional catch-all segments link', async () => {
          const browser = await webdriver(next.url, '/catch-all-link')
          expect(
            await browser
              .elementByCss('#to-catch-all-optional')
              .click()
              .waitForElementByCss('#text')
              .text()
          ).toBe(`hello from /catch-all-optional/this/is/a/test`)
        })

        it('should handle required segments', async () => {
          const params = ['this', 'is', 'a', 'test']
          const route = params.join('/')
          const html = await renderViaHTTP(next.url, `/catch-all/${route}`)
          const $ = cheerio.load(html)
          expect($('#text').attr('data-params')).toBe(route)

          // Components under catch-all should not be treated as route that errors during build.
          // They should be rendered properly when imported in page route.
          expect($('#widget').text()).toBe('widget')
        })

        it('should handle required segments root as not found', async () => {
          const res = await fetchViaHTTP(next.url, `/catch-all`)
          expect(res.status).toBe(404)
          expect(await res.text()).toContain('This page could not be found')
        })

        it('should handle catch-all segments link', async () => {
          const browser = await webdriver(next.url, '/catch-all-link')
          expect(
            await browser
              .elementByCss('#to-catch-all')
              .click()
              .waitForElementByCss('#text')
              .text()
          ).toBe(`hello from /catch-all/this/is/a/test`)
        })
      })

      describe('should serve client component', () => {
        it('should serve server-side', async () => {
          const html = await renderViaHTTP(next.url, '/client-component-route')
          const $ = cheerio.load(html)
          expect($('p').text()).toBe(
            'hello from app/client-component-route. count: 0'
          )
        })

        // TODO-APP: investigate hydration not kicking in on some runs
        it('should serve client-side', async () => {
          const browser = await webdriver(next.url, '/client-component-route')

          // After hydration count should be 1
          expect(await browser.elementByCss('p').text()).toBe(
            'hello from app/client-component-route. count: 1'
          )
        })
      })

      describe('should include client component layout with server component route', () => {
        it('should include it server-side', async () => {
          const html = await renderViaHTTP(next.url, '/client-nested')
          const $ = cheerio.load(html)
          // Should not be nested in dashboard
          expect($('h1').text()).toBe('Client Nested. Count: 0')
          // Should include the page text
          expect($('p').text()).toBe('hello from app/client-nested')
        })

        it('should include it client-side', async () => {
          const browser = await webdriver(next.url, '/client-nested')

          // After hydration count should be 1
          expect(await browser.elementByCss('h1').text()).toBe(
            'Client Nested. Count: 1'
          )

          // After hydration count should be 1
          expect(await browser.elementByCss('p').text()).toBe(
            'hello from app/client-nested'
          )
        })
      })

      describe('Loading', () => {
        it('should render loading.js in initial html for slow page', async () => {
          const html = await renderViaHTTP(next.url, '/slow-page-with-loading')
          const $ = cheerio.load(html)

          expect($('#loading').text()).toBe('Loading...')
        })

        it('should render loading.js in browser for slow page', async () => {
          const browser = await webdriver(next.url, '/slow-page-with-loading', {
            waitHydration: false,
          })
          // TODO-APP: `await webdriver()` causes waiting for the full page to complete streaming. At that point "Loading..." is replaced by the actual content
          // expect(await browser.elementByCss('#loading').text()).toBe('Loading...')

          expect(await browser.elementByCss('#slow-page-message').text()).toBe(
            'hello from slow page'
          )
        })

        it('should render loading.js in initial html for slow layout', async () => {
          const html = await renderViaHTTP(
            next.url,
            '/slow-layout-with-loading/slow'
          )
          const $ = cheerio.load(html)

          expect($('#loading').text()).toBe('Loading...')
        })

        it('should render loading.js in browser for slow layout', async () => {
          const browser = await webdriver(
            next.url,
            '/slow-layout-with-loading/slow',
            {
              waitHydration: false,
            }
          )
          // TODO-APP: `await webdriver()` causes waiting for the full page to complete streaming. At that point "Loading..." is replaced by the actual content
          // expect(await browser.elementByCss('#loading').text()).toBe('Loading...')

          expect(
            await browser.elementByCss('#slow-layout-message').text()
          ).toBe('hello from slow layout')

          expect(await browser.elementByCss('#page-message').text()).toBe(
            'Hello World'
          )
        })

        it('should render loading.js in initial html for slow layout and page', async () => {
          const html = await renderViaHTTP(
            next.url,
            '/slow-layout-and-page-with-loading/slow'
          )
          const $ = cheerio.load(html)

          expect($('#loading-layout').text()).toBe('Loading layout...')
          expect($('#loading-page').text()).toBe('Loading page...')
        })

        it('should render loading.js in browser for slow layout and page', async () => {
          const browser = await webdriver(
            next.url,
            '/slow-layout-and-page-with-loading/slow',
            {
              waitHydration: false,
            }
          )
          // TODO-APP: `await webdriver()` causes waiting for the full page to complete streaming. At that point "Loading..." is replaced by the actual content
          // expect(await browser.elementByCss('#loading-layout').text()).toBe('Loading...')
          // expect(await browser.elementByCss('#loading-page').text()).toBe('Loading...')

          expect(
            await browser.elementByCss('#slow-layout-message').text()
          ).toBe('hello from slow layout')

          expect(await browser.elementByCss('#slow-page-message').text()).toBe(
            'hello from slow page'
          )
        })
      })

      describe('middleware', () => {
        it.each(['rewrite', 'redirect'])(
          `should strip internal query parameters from requests to middleware for %s`,
          async (method) => {
            const browser = await webdriver(next.url, '/internal')

            try {
              // Wait for and click the navigation element, this should trigger
              // the flight request that'll be caught by the middleware. If the
              // middleware sees any flight data on the request it'll redirect to
              // a page with an element of #failure, otherwise, we'll see the
              // element for #success.
              await browser
                .waitForElementByCss(`#navigate-${method}`)
                .elementById(`navigate-${method}`)
                .click()
              expect(
                await browser.waitForElementByCss('#success', 3000).text()
              ).toBe('Success')
            } finally {
              await browser.close()
            }
          }
        )
      })

      describe('next/router', () => {
        it('should support router.back and router.forward', async () => {
          const browser = await webdriver(next.url, '/back-forward/1')

          const firstMessage = 'Hello from 1'
          const secondMessage = 'Hello from 2'

          expect(await browser.elementByCss('#message-1').text()).toBe(
            firstMessage
          )

          try {
            const message2 = await browser
              .waitForElementByCss('#to-other-page')
              .click()
              .waitForElementByCss('#message-2')
              .text()
            expect(message2).toBe(secondMessage)

            const message1 = await browser
              .waitForElementByCss('#back-button')
              .click()
              .waitForElementByCss('#message-1')
              .text()
            expect(message1).toBe(firstMessage)

            const message2Again = await browser
              .waitForElementByCss('#forward-button')
              .click()
              .waitForElementByCss('#message-2')
              .text()
            expect(message2Again).toBe(secondMessage)
          } finally {
            await browser.close()
          }
        })
      })

      describe('hooks', () => {
        describe('cookies function', () => {
          it('should retrieve cookies in a server component', async () => {
            const browser = await webdriver(next.url, '/hooks/use-cookies')

            try {
              await browser.waitForElementByCss('#does-not-have-cookie')
              browser.addCookie({ name: 'use-cookies', value: 'value' })
              browser.refresh()

              await browser.waitForElementByCss('#has-cookie')
              browser.deleteCookies()
              browser.refresh()

              await browser.waitForElementByCss('#does-not-have-cookie')
            } finally {
              await browser.close()
            }
          })

          it('should retrieve cookies in a server component in the edge runtime', async () => {
            const res = await fetchViaHTTP(next.url, '/edge-apis/cookies')
            expect(await res.text()).toInclude('Hello')
          })

          it('should access cookies on <Link /> navigation', async () => {
            const browser = await webdriver(next.url, '/navigation')

            try {
              // Click the cookies link to verify it can't see the cookie that's
              // not there.
              await browser.elementById('use-cookies').click()
              await browser.waitForElementByCss('#does-not-have-cookie')

              // Go back and add the cookies.
              await browser.back()
              await browser.waitForElementByCss('#from-navigation')
              browser.addCookie({ name: 'use-cookies', value: 'value' })

              // Click the cookies link again to see that the cookie can be picked
              // up again.
              await browser.elementById('use-cookies').click()
              await browser.waitForElementByCss('#has-cookie')

              // Go back and remove the cookies.
              await browser.back()
              await browser.waitForElementByCss('#from-navigation')
              browser.deleteCookies()

              // Verify for the last time that after clicking the cookie link
              // again, there are no cookies.
              await browser.elementById('use-cookies').click()
              await browser.waitForElementByCss('#does-not-have-cookie')
            } finally {
              await browser.close()
            }
          })
        })

        describe('headers function', () => {
          it('should have access to incoming headers in a server component', async () => {
            // Check to see that we can't see the header when it's not present.
            let html = await renderViaHTTP(
              next.url,
              '/hooks/use-headers',
              {},
              { headers: {} }
            )
            let $ = cheerio.load(html)
            expect($('#does-not-have-header').length).toBe(1)
            expect($('#has-header').length).toBe(0)

            // Check to see that we can see the header when it's present.
            html = await renderViaHTTP(
              next.url,
              '/hooks/use-headers',
              {},
              { headers: { 'x-use-headers': 'value' } }
            )
            $ = cheerio.load(html)
            expect($('#has-header').length).toBe(1)
            expect($('#does-not-have-header').length).toBe(0)
          })

          it('should access headers on <Link /> navigation', async () => {
            const browser = await webdriver(next.url, '/navigation')

            try {
              await browser.elementById('use-headers').click()
              await browser.waitForElementByCss('#has-referer')
            } finally {
              await browser.close()
            }
          })
        })

        describe('previewData function', () => {
          it('should return no preview data when there is none', async () => {
            const browser = await webdriver(next.url, '/hooks/use-preview-data')

            try {
              await browser.waitForElementByCss('#does-not-have-preview-data')
            } finally {
              await browser.close()
            }
          })

          it('should return preview data when there is some', async () => {
            const browser = await webdriver(next.url, '/api/preview')

            try {
              await browser.loadPage(next.url + '/hooks/use-preview-data', {
                disableCache: false,
                beforePageLoad: null,
              })
              await browser.waitForElementByCss('#has-preview-data')
            } finally {
              await browser.close()
            }
          })
        })

        describe('useRouter', () => {
          // TODO-APP: should enable when implemented
          it.skip('should throw an error when imported', async () => {
            const res = await fetchViaHTTP(next.url, '/hooks/use-router/server')
            expect(res.status).toBe(500)
            expect(await res.text()).toContain('Internal Server Error')
          })
        })

        describe('useParams', () => {
          // TODO-APP: should enable when implemented
          it.skip('should throw an error when imported', async () => {
            const res = await fetchViaHTTP(next.url, '/hooks/use-params/server')
            expect(res.status).toBe(500)
            expect(await res.text()).toContain('Internal Server Error')
          })
        })

        describe('useSearchParams', () => {
          // TODO-APP: should enable when implemented
          it.skip('should throw an error when imported', async () => {
            const res = await fetchViaHTTP(
              next.url,
              '/hooks/use-search-params/server'
            )
            expect(res.status).toBe(500)
            expect(await res.text()).toContain('Internal Server Error')
          })
        })

        describe('usePathname', () => {
          // TODO-APP: should enable when implemented
          it.skip('should throw an error when imported', async () => {
            const res = await fetchViaHTTP(
              next.url,
              '/hooks/use-pathname/server'
            )
            expect(res.status).toBe(500)
            expect(await res.text()).toContain('Internal Server Error')
          })
        })

        describe('useLayoutSegments', () => {
          // TODO-APP: should enable when implemented
          it.skip('should throw an error when imported', async () => {
            const res = await fetchViaHTTP(
              next.url,
              '/hooks/use-layout-segments/server'
            )
            expect(res.status).toBe(500)
            expect(await res.text()).toContain('Internal Server Error')
          })
        })

        describe('useSelectedLayoutSegment', () => {
          // TODO-APP: should enable when implemented
          it.skip('should throw an error when imported', async () => {
            const res = await fetchViaHTTP(
              next.url,
              '/hooks/use-selected-layout-segment/server'
            )
            expect(res.status).toBe(500)
            expect(await res.text()).toContain('Internal Server Error')
          })
        })
      })
    })

    describe('client components', () => {
      describe('hooks', () => {
        describe('usePathname', () => {
          it('should have the correct pathname', async () => {
            const html = await renderViaHTTP(next.url, '/hooks/use-pathname')
            const $ = cheerio.load(html)
            expect($('#pathname').attr('data-pathname')).toBe(
              '/hooks/use-pathname'
            )
          })

          it('should have the canonical url pathname on rewrite', async () => {
            const html = await renderViaHTTP(
              next.url,
              '/rewritten-use-pathname'
            )
            const $ = cheerio.load(html)
            expect($('#pathname').attr('data-pathname')).toBe(
              '/rewritten-use-pathname'
            )
          })
        })

        describe('useSearchParams', () => {
          it('should have the correct search params', async () => {
            const html = await renderViaHTTP(
              next.url,
              '/hooks/use-search-params?first=value&second=other%20value&third'
            )
            const $ = cheerio.load(html)
            expect($('#params-first').text()).toBe('value')
            expect($('#params-second').text()).toBe('other value')
            expect($('#params-third').text()).toBe('')
            expect($('#params-not-real').text()).toBe('N/A')
          })

          it('should have the canonical url search params on rewrite', async () => {
            const html = await renderViaHTTP(
              next.url,
              '/rewritten-use-search-params?first=a&second=b&third=c'
            )
            const $ = cheerio.load(html)
            expect($('#params-first').text()).toBe('a')
            expect($('#params-second').text()).toBe('b')
            expect($('#params-third').text()).toBe('c')
            expect($('#params-not-real').text()).toBe('N/A')
          })
        })

        describe('useRouter', () => {
          it('should allow access to the router', async () => {
            const browser = await webdriver(next.url, '/hooks/use-router')

            try {
              // Wait for the page to load, click the button (which uses a method
              // on the router) and then wait for the correct page to load.
              await browser.waitForElementByCss('#router')
              await browser.elementById('button-push').click()
              await browser.waitForElementByCss('#router-sub-page')

              // Go back (confirming we did do a hard push), and wait for the
              // correct previous page.
              await browser.back()
              await browser.waitForElementByCss('#router')
            } finally {
              await browser.close()
            }
          })

          if (!(global as any).isNextDeploy) {
            it('should have consistent query and params handling', async () => {
              const html = await renderViaHTTP(
                next.url,
                '/param-and-query/params?slug=query'
              )
              const $ = cheerio.load(html)
              const el = $('#params-and-query')
              expect(el.attr('data-params')).toBe('params')
              expect(el.attr('data-query')).toBe('query')
            })
          }
        })

        describe('useSelectedLayoutSegment', () => {
          it.each`
            path                                                           | outerLayout                                             | innerLayout
            ${'/hooks/use-selected-layout-segment/first'}                  | ${['first']}                                            | ${[]}
            ${'/hooks/use-selected-layout-segment/first/slug1'}            | ${['first', 'slug1']}                                   | ${['slug1']}
            ${'/hooks/use-selected-layout-segment/first/slug2/second'}     | ${['first', 'slug2', '(group)', 'second']}              | ${['slug2', '(group)', 'second']}
            ${'/hooks/use-selected-layout-segment/first/slug2/second/a/b'} | ${['first', 'slug2', '(group)', 'second', 'a/b']}       | ${['slug2', '(group)', 'second', 'a/b']}
            ${'/hooks/use-selected-layout-segment/rewritten'}              | ${['first', 'slug3', '(group)', 'second', 'catch/all']} | ${['slug3', '(group)', 'second', 'catch/all']}
            ${'/hooks/use-selected-layout-segment/rewritten-middleware'}   | ${['first', 'slug3', '(group)', 'second', 'catch/all']} | ${['slug3', '(group)', 'second', 'catch/all']}
          `(
            'should have the correct layout segments at $path',
            async ({ path, outerLayout, innerLayout }) => {
              const html = await renderViaHTTP(next.url, path)
              const $ = cheerio.load(html)

              expect(JSON.parse($('#outer-layout').text())).toEqual(outerLayout)
              expect(JSON.parse($('#inner-layout').text())).toEqual(innerLayout)
            }
          )

          it('should return an empty array in pages', async () => {
            const html = await renderViaHTTP(
              next.url,
              '/hooks/use-selected-layout-segment/first/slug2/second/a/b'
            )
            const $ = cheerio.load(html)

            expect(JSON.parse($('#page-layout-segments').text())).toEqual([])
          })
        })
      })

      if (isDev) {
        it('should HMR correctly for client component', async () => {
          const filePath = 'app/client-component-route/page.js'
          const origContent = await next.readFile(filePath)

          try {
            const browser = await webdriver(next.url, '/client-component-route')

            const ssrInitial = await renderViaHTTP(
              next.url,
              '/client-component-route'
            )

            expect(ssrInitial).toContain(
              'hello from app/client-component-route'
            )

            expect(await browser.elementByCss('p').text()).toContain(
              'hello from app/client-component-route'
            )

            await next.patchFile(
              filePath,
              origContent.replace('hello from', 'swapped from')
            )

            await check(() => browser.elementByCss('p').text(), /swapped from/)

            const ssrUpdated = await renderViaHTTP(
              next.url,
              '/client-component-route'
            )
            expect(ssrUpdated).toContain('swapped from')

            await next.patchFile(filePath, origContent)

            await check(() => browser.elementByCss('p').text(), /hello from/)
            expect(
              await renderViaHTTP(next.url, '/client-component-route')
            ).toContain('hello from')
          } finally {
            await next.patchFile(filePath, origContent)
          }
        })
      }
    })

    describe('css support', () => {
      describe('server layouts', () => {
        it('should support global css inside server layouts', async () => {
          const browser = await webdriver(next.url, '/dashboard')

          // Should body text in red
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('.p')).color`
            )
          ).toBe('rgb(255, 0, 0)')

          // Should inject global css for .green selectors
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('.green')).color`
            )
          ).toBe('rgb(0, 128, 0)')
        })

        it('should support css modules inside server layouts', async () => {
          const browser = await webdriver(next.url, '/css/css-nested')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#server-cssm')).color`
            )
          ).toBe('rgb(0, 128, 0)')
        })
      })

      describe('server pages', () => {
        it('should support global css inside server pages', async () => {
          const browser = await webdriver(next.url, '/css/css-page')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        })

        it('should support css modules inside server pages', async () => {
          const browser = await webdriver(next.url, '/css/css-page')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#cssm')).color`
            )
          ).toBe('rgb(0, 0, 255)')
        })

        if (!isDev) {
          it('should not include unused css modules in the page in prod', async () => {
            const browser = await webdriver(next.url, '/css/css-page/unused')
            expect(
              await browser.eval(
                `[...document.styleSheets].some(({ rules }) => [...rules].some(rule => rule.selectorText.includes('this_should_not_be_included')))`
              )
            ).toBe(false)
          })

          it('should not include unused css modules in nested pages in prod', async () => {
            const browser = await webdriver(
              next.url,
              '/css/css-page/unused-nested/inner'
            )
            expect(
              await browser.eval(
                `[...document.styleSheets].some(({ rules }) => [...rules].some(rule => rule.selectorText.includes('this_should_not_be_included_in_inner_path')))`
              )
            ).toBe(false)
          })
        }
      })

      describe('client layouts', () => {
        it('should support css modules inside client layouts', async () => {
          const browser = await webdriver(next.url, '/client-nested')

          // Should render h1 in red
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        })

        it('should support global css inside client layouts', async () => {
          const browser = await webdriver(next.url, '/client-nested')

          // Should render button in red
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('button')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        })
      })

      describe('client pages', () => {
        it('should support css modules inside client pages', async () => {
          const browser = await webdriver(next.url, '/client-component-route')

          // Should render p in red
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('p')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        })

        it('should support global css inside client pages', async () => {
          const browser = await webdriver(next.url, '/client-component-route')

          // Should render `b` in blue
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('b')).color`
            )
          ).toBe('rgb(0, 0, 255)')
        })
      })
    })

    describe('searchParams prop', () => {
      describe('client component', () => {
        it('should have the correct search params', async () => {
          const html = await renderViaHTTP(
            next.url,
            '/search-params-prop?first=value&second=other%20value&third'
          )
          const $ = cheerio.load(html)
          const el = $('#params')
          expect(el.attr('data-param-first')).toBe('value')
          expect(el.attr('data-param-second')).toBe('other value')
          expect(el.attr('data-param-third')).toBe('')
          expect(el.attr('data-param-not-real')).toBe('N/A')
        })

        it('should have the correct search params on rewrite', async () => {
          const html = await renderViaHTTP(
            next.url,
            '/search-params-prop-rewrite'
          )
          const $ = cheerio.load(html)
          const el = $('#params')
          expect(el.attr('data-param-first')).toBe('value')
          expect(el.attr('data-param-second')).toBe('other value')
          expect(el.attr('data-param-third')).toBe('')
          expect(el.attr('data-param-not-real')).toBe('N/A')
        })

        it('should have the correct search params on middleware rewrite', async () => {
          const html = await renderViaHTTP(
            next.url,
            '/search-params-prop-middleware-rewrite'
          )
          const $ = cheerio.load(html)
          const el = $('#params')
          expect(el.attr('data-param-first')).toBe('value')
          expect(el.attr('data-param-second')).toBe('other value')
          expect(el.attr('data-param-third')).toBe('')
          expect(el.attr('data-param-not-real')).toBe('N/A')
        })
      })

      describe('server component', () => {
        it('should have the correct search params', async () => {
          const html = await renderViaHTTP(
            next.url,
            '/search-params-prop/server?first=value&second=other%20value&third'
          )
          const $ = cheerio.load(html)
          const el = $('#params')
          expect(el.attr('data-param-first')).toBe('value')
          expect(el.attr('data-param-second')).toBe('other value')
          expect(el.attr('data-param-third')).toBe('')
          expect(el.attr('data-param-not-real')).toBe('N/A')
        })

        it('should have the correct search params on rewrite', async () => {
          const html = await renderViaHTTP(
            next.url,
            '/search-params-prop-server-rewrite'
          )
          const $ = cheerio.load(html)
          const el = $('#params')
          expect(el.attr('data-param-first')).toBe('value')
          expect(el.attr('data-param-second')).toBe('other value')
          expect(el.attr('data-param-third')).toBe('')
          expect(el.attr('data-param-not-real')).toBe('N/A')
        })

        it('should have the correct search params on middleware rewrite', async () => {
          const html = await renderViaHTTP(
            next.url,
            '/search-params-prop-server-middleware-rewrite'
          )
          const $ = cheerio.load(html)
          const el = $('#params')
          expect(el.attr('data-param-first')).toBe('value')
          expect(el.attr('data-param-second')).toBe('other value')
          expect(el.attr('data-param-third')).toBe('')
          expect(el.attr('data-param-not-real')).toBe('N/A')
        })
      })
    })

    describe('sass support', () => {
      describe('server layouts', () => {
        it('should support global sass/scss inside server layouts', async () => {
          const browser = await webdriver(next.url, '/css/sass/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-server-layout')).color`
            )
          ).toBe('rgb(165, 42, 42)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-server-layout')).color`
            )
          ).toBe('rgb(222, 184, 135)')
        })

        it('should support sass/scss modules inside server layouts', async () => {
          const browser = await webdriver(next.url, '/css/sass/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-server-layout')).backgroundColor`
            )
          ).toBe('rgb(233, 150, 122)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-server-layout')).backgroundColor`
            )
          ).toBe('rgb(139, 0, 0)')
        })
      })

      describe('server pages', () => {
        it('should support global sass/scss inside server pages', async () => {
          const browser = await webdriver(next.url, '/css/sass/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-server-page')).color`
            )
          ).toBe('rgb(245, 222, 179)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-server-page')).color`
            )
          ).toBe('rgb(255, 99, 71)')
        })

        it('should support sass/scss modules inside server pages', async () => {
          const browser = await webdriver(next.url, '/css/sass/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-server-page')).backgroundColor`
            )
          ).toBe('rgb(75, 0, 130)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-server-page')).backgroundColor`
            )
          ).toBe('rgb(0, 255, 255)')
        })
      })

      describe('client layouts', () => {
        it('should support global sass/scss inside client layouts', async () => {
          const browser = await webdriver(next.url, '/css/sass-client/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-client-layout')).color`
            )
          ).toBe('rgb(165, 42, 42)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-client-layout')).color`
            )
          ).toBe('rgb(222, 184, 135)')
        })

        it('should support sass/scss modules inside client layouts', async () => {
          const browser = await webdriver(next.url, '/css/sass-client/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-client-layout')).backgroundColor`
            )
          ).toBe('rgb(233, 150, 122)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-client-layout')).backgroundColor`
            )
          ).toBe('rgb(139, 0, 0)')
        })
      })
    })

    describe('client pages', () => {
      it('should support global sass/scss inside client pages', async () => {
        const browser = await webdriver(next.url, '/css/sass-client/inner')
        await waitFor(5000)
        // .sass
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('#sass-client-page')).color`
          )
        ).toBe('rgb(245, 222, 179)')
        // .scss
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('#scss-client-page')).color`
          )
        ).toBe('rgb(255, 99, 71)')
      })

      it('should support sass/scss modules inside client pages', async () => {
        const browser = await webdriver(next.url, '/css/sass-client/inner')
        // .sass
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('#sass-client-page')).backgroundColor`
          )
        ).toBe('rgb(75, 0, 130)')
        // .scss
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('#scss-client-page')).backgroundColor`
          )
        ).toBe('rgb(0, 255, 255)')
      })
    })
    ;(isDev ? describe.skip : describe)('Subresource Integrity', () => {
      function fetchWithPolicy(policy: string | null) {
        return fetchViaHTTP(next.url, '/dashboard', undefined, {
          headers: policy
            ? {
                'Content-Security-Policy': policy,
              }
            : {},
        })
      }

      async function renderWithPolicy(policy: string | null) {
        const res = await fetchWithPolicy(policy)

        expect(res.ok).toBe(true)

        const html = await res.text()

        return cheerio.load(html)
      }

      it('does not include nonce when not enabled', async () => {
        const policies = [
          `script-src 'nonce-'`, // invalid nonce
          'style-src "nonce-cmFuZG9tCg=="', // no script or default src
          '', // empty string
        ]

        for (const policy of policies) {
          const $ = await renderWithPolicy(policy)

          // Find all the script tags without src attributes and with nonce
          // attributes.
          const elements = $('script[nonce]:not([src])')

          // Expect there to be none.
          expect(elements.length).toBe(0)
        }
      })

      it('includes a nonce value with inline scripts when Content-Security-Policy header is defined', async () => {
        // A random nonce value, base64 encoded.
        const nonce = 'cmFuZG9tCg=='

        // Validate all the cases where we could parse the nonce.
        const policies = [
          `script-src 'nonce-${nonce}'`, // base case
          `   script-src   'nonce-${nonce}' `, // extra space added around sources and directive
          `style-src 'self'; script-src 'nonce-${nonce}'`, // extra directives
          `script-src 'self' 'nonce-${nonce}' 'nonce-othernonce'`, // extra nonces
          `default-src 'nonce-othernonce'; script-src 'nonce-${nonce}';`, // script and then fallback case
          `default-src 'nonce-${nonce}'`, // fallback case
        ]

        for (const policy of policies) {
          const $ = await renderWithPolicy(policy)

          // Find all the script tags without src attributes.
          const elements = $('script:not([src])')

          // Expect there to be at least 1 script tag without a src attribute.
          expect(elements.length).toBeGreaterThan(0)

          // Expect all inline scripts to have the nonce value.
          elements.each((i, el) => {
            expect(el.attribs['nonce']).toBe(nonce)
          })
        }
      })

      it('includes an integrity attribute on scripts', async () => {
        const html = await renderViaHTTP(next.url, '/dashboard')

        const $ = cheerio.load(html)

        // Find all the script tags with src attributes.
        const elements = $('script[src]')

        // Expect there to be at least 1 script tag with a src attribute.
        expect(elements.length).toBeGreaterThan(0)

        // Collect all the scripts with integrity hashes so we can verify them.
        const files: [string, string][] = []

        // For each of these attributes, ensure that there's an integrity
        // attribute and starts with the correct integrity hash prefix.
        elements.each((i, el) => {
          const integrity = el.attribs['integrity']
          expect(integrity).toBeDefined()
          expect(integrity).toStartWith('sha256-')

          const src = el.attribs['src']
          expect(src).toBeDefined()

          files.push([src, integrity])
        })

        // For each script tag, ensure that the integrity attribute is the
        // correct hash of the script tag.
        for (const [src, integrity] of files) {
          const res = await fetchViaHTTP(next.url, src)
          expect(res.status).toBe(200)
          const content = await res.text()

          const hash = crypto
            .createHash('sha256')
            .update(content)
            .digest()
            .toString('base64')

          expect(integrity).toEndWith(hash)
        }
      })

      it('throws when escape characters are included in nonce', async () => {
        const res = await fetchWithPolicy(
          `script-src 'nonce-"><script></script>"'`
        )

        expect(res.status).toBe(500)
      })
    })

    describe('template component', () => {
      it('should render the template that holds state in a client component and reset on navigation', async () => {
        const browser = await webdriver(next.url, '/template/clientcomponent')
        expect(await browser.elementByCss('h1').text()).toBe('Template 0')
        await browser.elementByCss('button').click()
        expect(await browser.elementByCss('h1').text()).toBe('Template 1')

        await browser.elementByCss('#link').click()
        await browser.waitForElementByCss('#other-page')

        expect(await browser.elementByCss('h1').text()).toBe('Template 0')
        await browser.elementByCss('button').click()
        expect(await browser.elementByCss('h1').text()).toBe('Template 1')

        await browser.elementByCss('#link').click()
        await browser.waitForElementByCss('#page')

        expect(await browser.elementByCss('h1').text()).toBe('Template 0')
      })

      // TODO-APP: disable failing test and investigate later
      ;(isDev ? it.skip : it)(
        'should render the template that is a server component and rerender on navigation',
        async () => {
          const browser = await webdriver(next.url, '/template/servercomponent')
          // eslint-disable-next-line jest/no-standalone-expect
          expect(await browser.elementByCss('h1').text()).toStartWith(
            'Template'
          )

          const currentTime = await browser
            .elementByCss('#performance-now')
            .text()

          await browser.elementByCss('#link').click()
          await browser.waitForElementByCss('#other-page')

          // eslint-disable-next-line jest/no-standalone-expect
          expect(await browser.elementByCss('h1').text()).toStartWith(
            'Template'
          )

          // template should rerender on navigation even when it's a server component
          // eslint-disable-next-line jest/no-standalone-expect
          expect(await browser.elementByCss('#performance-now').text()).toBe(
            currentTime
          )

          await browser.elementByCss('#link').click()
          await browser.waitForElementByCss('#page')

          // eslint-disable-next-line jest/no-standalone-expect
          expect(await browser.elementByCss('#performance-now').text()).toBe(
            currentTime
          )
        }
      )
    })

    describe('error component', () => {
      it('should trigger error component when an error happens during rendering', async () => {
        const browser = await webdriver(next.url, '/error/client-component')
        await browser.elementByCss('#error-trigger-button').click()

        if (isDev) {
          expect(await hasRedbox(browser)).toBe(true)
          expect(await getRedboxHeader(browser)).toMatch(/this is a test/)
        } else {
          await browser
          expect(
            await browser
              .waitForElementByCss('#error-boundary-message')
              .elementByCss('#error-boundary-message')
              .text()
          ).toBe('An error occurred: this is a test')
        }
      })

      it('should trigger error component when an error happens during server components rendering', async () => {
        const browser = await webdriver(next.url, '/error/server-component')

        if (isDev) {
          expect(
            await browser
              .waitForElementByCss('#error-boundary-message')
              .elementByCss('#error-boundary-message')
              .text()
          ).toBe('this is a test')
          expect(
            await browser.waitForElementByCss('#error-boundary-digest').text()
            // Digest of the error message should be stable.
          ).not.toBe('')
          // TODO-APP: ensure error overlay is shown for errors that happened before/during hydration
          // expect(await hasRedbox(browser)).toBe(true)
          // expect(await getRedboxHeader(browser)).toMatch(/this is a test/)
        } else {
          await browser
          expect(
            await browser.waitForElementByCss('#error-boundary-message').text()
          ).toBe(
            'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
          )
          expect(
            await browser.waitForElementByCss('#error-boundary-digest').text()
            // Digest of the error message should be stable.
          ).not.toBe('')
        }
      })

      it('should use default error boundary for prod and overlay for dev when no error component specified', async () => {
        const browser = await webdriver(
          next.url,
          '/error/global-error-boundary'
        )
        await browser.elementByCss('#error-trigger-button').click()
        // .waitForElementByCss('body')

        if (isDev) {
          expect(await hasRedbox(browser)).toBe(true)
          console.log('getRedboxHeader', await getRedboxHeader(browser))
          // expect(await getRedboxHeader(browser)).toMatch(/An error occurred: this is a test/)
        } else {
          expect(
            await browser
              .waitForElementByCss('body')
              .elementByCss('body')
              .text()
          ).toBe(
            'Application error: a client-side exception has occurred (see the browser console for more information).'
          )
        }
      })

      if (!isDev) {
        it('should allow resetting error boundary', async () => {
          const browser = await webdriver(next.url, '/error/client-component')

          // Try triggering and resetting a few times in a row
          for (let i = 0; i < 5; i++) {
            await browser
              .elementByCss('#error-trigger-button')
              .click()
              .waitForElementByCss('#error-boundary-message')

            expect(
              await browser.elementByCss('#error-boundary-message').text()
            ).toBe('An error occurred: this is a test')

            await browser
              .elementByCss('#reset')
              .click()
              .waitForElementByCss('#error-trigger-button')

            expect(
              await browser.elementByCss('#error-trigger-button').text()
            ).toBe('Trigger Error!')
          }
        })

        it('should hydrate empty shell to handle server-side rendering errors', async () => {
          const browser = await webdriver(
            next.url,
            '/error/ssr-error-client-component'
          )
          const logs = await browser.log()
          const errors = logs
            .filter((x) => x.source === 'error')
            .map((x) => x.message)
            .join('\n')
          expect(errors).toInclude('Error during SSR')
        })
      }
    })

    describe('known bugs', () => {
      it('should not share flight data between requests', async () => {
        const fetches = await Promise.all(
          [...new Array(5)].map(() =>
            renderViaHTTP(next.url, '/loading-bug/electronics')
          )
        )

        for (const text of fetches) {
          const $ = cheerio.load(text)
          expect($('#category-id').text()).toBe('electronicsabc')
        }
      })
      it('should handle as on next/link', async () => {
        const browser = await webdriver(next.url, '/link-with-as')
        expect(
          await browser
            .elementByCss('#link-to-info-123')
            .click()
            .waitForElementByCss('#message')
            .text()
        ).toBe(`hello from app/dashboard/deployments/info/[id]. ID is: 123`)
      })
      it('should handle next/link back to initially loaded page', async () => {
        const browser = await webdriver(next.url, '/linking/about')
        expect(
          await browser
            .elementByCss('a[href="/linking"]')
            .click()
            .waitForElementByCss('#home-page')
            .text()
        ).toBe(`Home page`)

        expect(
          await browser
            .elementByCss('a[href="/linking/about"]')
            .click()
            .waitForElementByCss('#about-page')
            .text()
        ).toBe(`About page`)
      })
    })

    describe('not-found', () => {
      it('should trigger not-found in a server component', async () => {
        const browser = await webdriver(next.url, '/not-found/servercomponent')

        expect(
          await browser.waitForElementByCss('#not-found-component').text()
        ).toBe('Not Found!')
        expect(
          await browser
            .waitForElementByCss('meta[name="robots"]')
            .getAttribute('content')
        ).toBe('noindex')
      })

      it('should trigger not-found in a client component', async () => {
        const browser = await webdriver(next.url, '/not-found/clientcomponent')
        expect(
          await browser.waitForElementByCss('#not-found-component').text()
        ).toBe('Not Found!')
        expect(
          await browser
            .waitForElementByCss('meta[name="robots"]')
            .getAttribute('content')
        ).toBe('noindex')
      })
      it('should trigger not-found client-side', async () => {
        const browser = await webdriver(next.url, '/not-found/client-side')
        await browser
          .elementByCss('button')
          .click()
          .waitForElementByCss('#not-found-component')
        expect(await browser.elementByCss('#not-found-component').text()).toBe(
          'Not Found!'
        )
        expect(
          await browser
            .waitForElementByCss('meta[name="robots"]')
            .getAttribute('content')
        ).toBe('noindex')
      })
    })

    describe('bots', () => {
      if (!(global as any).isNextDeploy) {
        it('should block rendering for bots and return 404 status', async () => {
          const res = await fetchViaHTTP(
            next.url,
            '/not-found/servercomponent',
            '',
            {
              headers: {
                'User-Agent': 'Googlebot',
              },
            }
          )

          expect(res.status).toBe(404)
          expect(await res.text()).toInclude('"noindex"')
        })
      }
    })

    describe('redirect', () => {
      describe('components', () => {
        it('should redirect in a server component', async () => {
          const browser = await webdriver(next.url, '/redirect/servercomponent')
          await browser.waitForElementByCss('#result-page')
          expect(await browser.elementByCss('#result-page').text()).toBe(
            'Result Page'
          )
        })

        it('should redirect in a client component', async () => {
          const browser = await webdriver(next.url, '/redirect/clientcomponent')
          await browser.waitForElementByCss('#result-page')
          expect(await browser.elementByCss('#result-page').text()).toBe(
            'Result Page'
          )
        })

        // TODO-APP: Enable in development
        it('should redirect client-side', async () => {
          const browser = await webdriver(next.url, '/redirect/client-side')
          await browser
            .elementByCss('button')
            .click()
            .waitForElementByCss('#result-page')
          // eslint-disable-next-line jest/no-standalone-expect
          expect(await browser.elementByCss('#result-page').text()).toBe(
            'Result Page'
          )
        })
      })

      describe('next.config.js redirects', () => {
        it('should redirect from next.config.js', async () => {
          const browser = await webdriver(next.url, '/redirect/a')
          expect(await browser.elementByCss('h1').text()).toBe('Dashboard')
          expect(await browser.url()).toBe(next.url + '/dashboard')
        })

        it('should redirect from next.config.js with link navigation', async () => {
          const browser = await webdriver(
            next.url,
            '/redirect/next-config-redirect'
          )
          await browser
            .elementByCss('#redirect-a')
            .click()
            .waitForElementByCss('h1')
          expect(await browser.elementByCss('h1').text()).toBe('Dashboard')
          expect(await browser.url()).toBe(next.url + '/dashboard')
        })
      })

      describe('middleware redirects', () => {
        it('should redirect from middleware', async () => {
          const browser = await webdriver(
            next.url,
            '/redirect-middleware-to-dashboard'
          )
          expect(await browser.elementByCss('h1').text()).toBe('Dashboard')
          expect(await browser.url()).toBe(next.url + '/dashboard')
        })

        it('should redirect from middleware with link navigation', async () => {
          const browser = await webdriver(
            next.url,
            '/redirect/next-middleware-redirect'
          )
          await browser
            .elementByCss('#redirect-middleware')
            .click()
            .waitForElementByCss('h1')
          expect(await browser.elementByCss('h1').text()).toBe('Dashboard')
          expect(await browser.url()).toBe(next.url + '/dashboard')
        })
      })
    })

    describe('nested navigation', () => {
      it('should navigate to nested pages', async () => {
        const browser = await webdriver(next.url, '/nested-navigation')
        expect(await browser.elementByCss('h1').text()).toBe('Home')

        const pages = [
          ['Electronics', ['Phones', 'Tablets', 'Laptops']],
          ['Clothing', ['Tops', 'Shorts', 'Shoes']],
          ['Books', ['Fiction', 'Biography', 'Education']],
        ] as const

        for (const [category, subCategories] of pages) {
          expect(
            await browser
              .elementByCss(
                `a[href="/nested-navigation/${category.toLowerCase()}"]`
              )
              .click()
              .waitForElementByCss(`#all-${category.toLowerCase()}`)
              .text()
          ).toBe(`All ${category}`)

          for (const subcategory of subCategories) {
            expect(
              await browser
                .elementByCss(
                  `a[href="/nested-navigation/${category.toLowerCase()}/${subcategory.toLowerCase()}"]`
                )
                .click()
                .waitForElementByCss(`#${subcategory.toLowerCase()}`)
                .text()
            ).toBe(`${subcategory}`)
          }
        }
      })
    })

    describe('next/script', () => {
      if (!(global as any).isNextDeploy) {
        it('should support next/script and render in correct order', async () => {
          const browser = await webdriver(next.url, '/script')

          // Wait for lazyOnload scripts to be ready.
          await new Promise((resolve) => setTimeout(resolve, 1000))

          expect(await browser.eval(`window._script_order`)).toStrictEqual([
            1,
            1.5,
            2,
            2.5,
            'render',
            3,
            4,
          ])
        })
      }

      it('should insert preload tags for beforeInteractive and afterInteractive scripts', async () => {
        const html = await renderViaHTTP(next.url, '/script')
        expect(html).toContain(
          '<link href="/test1.js" rel="preload" as="script"/>'
        )
        expect(html).toContain(
          '<link href="/test2.js" rel="preload" as="script"/>'
        )
        expect(html).toContain(
          '<link href="/test3.js" rel="preload" as="script"/>'
        )

        // test4.js has lazyOnload which doesn't need to be preloaded
        expect(html).not.toContain(
          '<script src="/test4.js" rel="preload" as="script"/>'
        )
      })
    })
  }

  runTests()
})
