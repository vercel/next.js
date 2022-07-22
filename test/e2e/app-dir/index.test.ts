import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP, waitFor } from 'next-test-utils'
import path from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'

describe('app dir', () => {
  const isDev = (global as any).isNextDev

  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        public: new FileRef(path.join(__dirname, 'app/public')),
        styles: new FileRef(path.join(__dirname, 'app/styles')),
        pages: new FileRef(path.join(__dirname, 'app/pages')),
        app: new FileRef(path.join(__dirname, 'app/app')),
        'next.config.js': new FileRef(
          path.join(__dirname, 'app/next.config.js')
        ),
      },
      dependencies: {
        react: 'experimental',
        'react-dom': 'experimental',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should pass props from getServerSideProps in root layout', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard')
    const $ = cheerio.load(html)
    expect($('title').text()).toBe('hello world')
  })

  it('should serve from pages', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello from pages/index')
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

  it('should serve /index as separate page', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard/index')
    expect(html).toContain('hello from app/dashboard/index')
    // should load chunks generated via async import correctly
    expect(html).toContain('hello from lazy')
  })

  // TODO-APP: handle css modules fouc in dev
  it.skip('should handle css imports in next/dynamic correctly', async () => {
    const browser = await webdriver(next.url, '/dashboard/index')

    expect(
      await browser.eval(
        `window.getComputedStyle(document.querySelector('#css-text-dynamic')).color`
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

  // TODO: handle new root layout
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

  // TODO: do we want to make this only work for /root or is it allowed
  // to work for /pages as well?
  it.skip('should match partial parameters', async () => {
    const html = await renderViaHTTP(next.url, '/partial-match-123')
    expect(html).toContain('hello from app/partial-match-[id]. ID is: 123')
  })

  it('should support rewrites', async () => {
    const html = await renderViaHTTP(next.url, '/rewritten-to-dashboard')
    expect(html).toContain('hello from app/dashboard')
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

  describe('<Link />', () => {
    // TODO-APP: fix development test
    it.skip('should hard push', async () => {
      const browser = await webdriver(next.url, '/link-hard-push')

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
        await browser.waitForElementByCss('#render-id')

        // Get the id again, and compare, they should not be the same.
        const secondID = await browser.elementById('render-id').text()
        expect(secondID).not.toBe(firstID)
      } finally {
        await browser.close()
      }
    })

    // TODO-APP: fix development test
    it.skip('should hard replace', async () => {
      const browser = await webdriver(next.url, '/link-hard-replace')

      try {
        // Get the render ID so we can compare it.
        const firstID = await browser.elementById('render-id').text()

        // Click the link on the page, and verify that the history entry was NOT
        // added.
        expect(await browser.eval('window.history.length')).toBe(2)
        await browser.elementById('self-link').click()
        await browser.waitForElementByCss('#render-id')
        expect(await browser.eval('window.history.length')).toBe(2)

        // Get the date again, and compare, they should not be the same.
        const secondID = await browser.elementById('render-id').text()
        expect(secondID).not.toBe(firstID)

        // Navigate to the subpage, verify that the history entry was NOT added.
        await browser.elementById('subpage-link').click()
        await browser.waitForElementByCss('#back-link')
        expect(await browser.eval('window.history.length')).toBe(2)

        // Navigate back again, verify that the history entry was NOT added.
        await browser.elementById('back-link').click()
        await browser.waitForElementByCss('#render-id')
        expect(await browser.eval('window.history.length')).toBe(2)

        // Get the date again, and compare, they should not be the same.
        const thirdID = await browser.elementById('render-id').text()
        expect(thirdID).not.toBe(secondID)
      } finally {
        await browser.close()
      }
    })

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

    it('should soft replace', async () => {
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

    it('should respect rewrites', async () => {
      const browser = await webdriver(next.url, '/rewrites')

      try {
        // Click the link.
        await browser.elementById('link').click()
        await browser.waitForElementByCss('#from-dashboard')

        // Check to see that we were rewritten and not redirected.
        const pathname = await browser.eval('window.location.pathname')
        expect(pathname).toBe('/rewritten-to-dashboard')

        // Check to see that the page we navigated to is in fact the dashboard.
        const html = await browser.eval(
          'window.document.documentElement.innerText'
        )
        expect(html).toContain('hello from app/dashboard')
      } finally {
        await browser.close()
      }
    })

    // TODO-APP: should enable when implemented
    it.skip('should allow linking from app page to pages page', async () => {
      const browser = await webdriver(next.url, '/pages-linking')

      try {
        // Click the link.
        await browser.elementById('app-link').click()
        await browser.waitForElementByCss('#pages-link')

        // Click the other link.
        await browser.elementById('pages-link').click()
        await browser.waitForElementByCss('#app-link')
      } finally {
        await browser.close()
      }
    })
  })

  describe('server components', () => {
    // TODO: why is this not servable but /dashboard+rootonly/hello.server.js
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
        const html = await renderViaHTTP(next.url, '/dynamic/books/hello-world')
        const $ = cheerio.load(html)

        expect($('#dynamic-layout-params').text()).toBe('{}')
        expect($('#category-layout-params').text()).toBe('{"category":"books"}')
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
          `/optional-catch-all/${route}`
        )
        const $ = cheerio.load(html)
        expect($('#text').attr('data-params')).toBe(route)
      })

      it('should handle optional segments root', async () => {
        const html = await renderViaHTTP(next.url, `/optional-catch-all`)
        const $ = cheerio.load(html)
        expect($('#text').attr('data-params')).toBe('')
      })

      it('should handle required segments', async () => {
        const params = ['this', 'is', 'a', 'test']
        const route = params.join('/')
        const html = await renderViaHTTP(next.url, `/catch-all/${route}`)
        const $ = cheerio.load(html)
        expect($('#text').attr('data-params')).toBe(route)
      })

      it('should handle required segments root as not found', async () => {
        const res = await fetchViaHTTP(next.url, `/catch-all`)
        expect(res.status).toBe(404)
        expect(await res.text()).toContain('This page could not be found')
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

      // TODO: investigate hydration not kicking in on some runs
      it.skip('should serve client-side', async () => {
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

      // TODO: investigate hydration not kicking in on some runs
      it.skip('should include it client-side', async () => {
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
        // TODO: `await webdriver()` causes waiting for the full page to complete streaming. At that point "Loading..." is replaced by the actual content
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
        // TODO: `await webdriver()` causes waiting for the full page to complete streaming. At that point "Loading..." is replaced by the actual content
        // expect(await browser.elementByCss('#loading').text()).toBe('Loading...')

        expect(await browser.elementByCss('#slow-layout-message').text()).toBe(
          'hello from slow layout'
        )

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
        // TODO: `await webdriver()` causes waiting for the full page to complete streaming. At that point "Loading..." is replaced by the actual content
        // expect(await browser.elementByCss('#loading-layout').text()).toBe('Loading...')
        // expect(await browser.elementByCss('#loading-page').text()).toBe('Loading...')

        expect(await browser.elementByCss('#slow-layout-message').text()).toBe(
          'hello from slow layout'
        )

        expect(await browser.elementByCss('#slow-page-message').text()).toBe(
          'hello from slow page'
        )
      })
    })

    describe('hooks', () => {
      describe('useCookies', () => {
        it('should retrive cookies in a server component', async () => {
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

      describe('useHeaders', () => {
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

      describe('usePreviewData', () => {
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
          const res = await fetchViaHTTP(next.url, '/hooks/use-pathname/server')
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
      describe('useCookies', () => {
        // TODO-APP: should enable when implemented
        it.skip('should throw an error when imported', async () => {
          const res = await fetchViaHTTP(next.url, '/hooks/use-cookies/client')
          expect(res.status).toBe(500)
          expect(await res.text()).toContain('Internal Server Error')
        })
      })

      describe('usePreviewData', () => {
        // TODO-APP: should enable when implemented
        it.skip('should throw an error when imported', async () => {
          const res = await fetchViaHTTP(
            next.url,
            '/hooks/use-preview-data/client'
          )
          expect(res.status).toBe(500)
          expect(await res.text()).toContain('Internal Server Error')
        })
      })

      describe('useHeaders', () => {
        // TODO-APP: should enable when implemented
        it.skip('should throw an error when imported', async () => {
          const res = await fetchViaHTTP(next.url, '/hooks/use-headers/client')
          expect(res.status).toBe(500)
          expect(await res.text()).toContain('Internal Server Error')
        })
      })

      describe('usePathname', () => {
        it('should have the correct pathname', async () => {
          const html = await renderViaHTTP(next.url, '/hooks/use-pathname')
          const $ = cheerio.load(html)
          expect($('#pathname').attr('data-pathname')).toBe(
            '/hooks/use-pathname'
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
          const el = $('#params')
          expect(el.attr('data-param-first')).toBe('value')
          expect(el.attr('data-param-second')).toBe('other value')
          expect(el.attr('data-param-third')).toBe('')
          expect(el.attr('data-param-not-real')).toBe('N/A')
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
      })
    })

    it('should throw an error when getStaticProps is used', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/client-with-errors/get-static-props'
      )
      expect(res.status).toBe(500)
      expect(await res.text()).toContain(
        isDev
          ? 'getStaticProps is not supported on Client Components'
          : 'Internal Server Error'
      )
    })

    it('should throw an error when getServerSideProps is used', async () => {
      const res = await fetchViaHTTP(
        next.url,
        '/client-with-errors/get-server-side-props'
      )
      expect(res.status).toBe(500)
      expect(await res.text()).toContain(
        isDev
          ? 'getServerSideProps is not supported on Client Components'
          : 'Internal Server Error'
      )
    })
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

    describe.skip('server pages', () => {
      it('should support global css inside server pages', async () => {})
      it('should support css modules inside server pages', async () => {})
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
})
