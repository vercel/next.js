/* eslint-env jest */

import {
  waitFor,
  check,
  retry,
  getRedboxTotalErrorCount,
} from 'next-test-utils'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Client Navigation', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })
  const isRspack = !!process.env.NEXT_RSPACK

  describe('with empty getInitialProps()', () => {
    it('should render a redbox', async () => {
      const pageErrors: unknown[] = []
      const browser = await next.browser('/nav', {
        beforePageLoad: (page) => {
          page.on('pageerror', (error: unknown) => {
            pageErrors.push(error)
          })
        },
      })
      await browser.elementByCss('#empty-props').click()
      await expect(browser).toDisplayRedbox(`
       {
         "description": ""EmptyInitialPropsPage.getInitialProps()" should resolve to an object. But found "null" instead.",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
      expect(pageErrors).toEqual([
        expect.objectContaining({
          message:
            '"EmptyInitialPropsPage.getInitialProps()" should resolve to an object. But found "null" instead.',
        }),
      ])
    })
  })

  describe('with the current url', () => {
    it('should reload the page', async () => {
      const browser = await next.browser('/nav/self-reload')
      const defaultCount = await browser.elementByCss('p').text()
      expect(defaultCount).toBe('COUNT: 0')

      await browser.elementByCss('#self-reload-link').click()

      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe('COUNT: 1')
      })
      await browser.close()
    })

    it('should always replace the state', async () => {
      const browser = await next.browser('/nav')

      const countAfterClicked = await browser
        .elementByCss('#self-reload-link')
        .click()
        .waitForElementByCss('#self-reload-page')
        .elementByCss('#self-reload-link')
        .click()
        .elementByCss('#self-reload-link')
        .click()
        .elementByCss('p')
        .text()

      // counts (page change + two clicks)
      expect(countAfterClicked).toBe('COUNT: 3')

      // Since we replace the state, back button would simply go us back to /nav
      await browser.back().waitForElementByCss('.nav-home')

      await browser.close()
    })
  })

  describe('with URL objects', () => {
    it('should work with <Link/>', async () => {
      const browser = await next.browser('/nav')
      const text = await browser
        .elementByCss('#query-string-link')
        .click()
        .waitForElementByCss('.nav-querystring')
        .elementByCss('p')
        .text()
      expect(text).toBe('10')

      expect(await browser.url()).toBe(
        `http://localhost:${next.appPort}/nav/querystring/10#10`
      )
      await browser.close()
    })

    it('should work with "Router.push"', async () => {
      const browser = await next.browser('/nav')
      const text = await browser
        .elementByCss('#query-string-button')
        .click()
        .waitForElementByCss('.nav-querystring')
        .elementByCss('p')
        .text()
      expect(text).toBe('10')

      expect(await browser.url()).toBe(
        `http://localhost:${next.appPort}/nav/querystring/10#10`
      )
      await browser.close()
    })

    it('should work with the "replace" prop', async () => {
      const browser = await next.browser('/nav')

      let stackLength = await browser.eval('window.history.length')

      expect(stackLength).toBe(2)

      // Navigation to /about using a replace link should maintain the url stack length
      const text = await browser
        .elementByCss('#about-replace-link')
        .click()
        .waitForElementByCss('.nav-about')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the about page.')

      stackLength = await browser.eval('window.history.length')

      expect(stackLength).toBe(2)

      // Going back to the home with a regular link will augment the history count
      await browser
        .elementByCss('#home-link')
        .click()
        .waitForElementByCss('.nav-home')

      stackLength = await browser.eval('window.history.length')

      expect(stackLength).toBe(3)

      await browser.close()
    })

    it('should handle undefined in router.push', async () => {
      const browser = await next.browser('/nav/query-params')
      await browser.elementByCss('#click-me').click()
      const query = JSON.parse(
        await browser.waitForElementByCss('#query-value').text()
      )
      expect(query).toEqual({
        param1: '',
        param2: '',
        param3: '',
        param4: '0',
        param5: 'false',
        param7: '',
        param8: '',
        param9: '',
        param10: '',
        param11: ['', '', '', '0', 'false', '', '', '', '', ''],
      })
    })
  })

  describe('with getInitialProp redirect', () => {
    it('should redirect the page via client side', async () => {
      const browser = await next.browser('/nav')
      const text = await browser
        .elementByCss('#redirect-link')
        .click()
        .waitForElementByCss('.nav-about')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the about page.')
      await browser.close()
    })

    it('should redirect the page when loading', async () => {
      const browser = await next.browser('/nav/redirect')
      const text = await browser
        .waitForElementByCss('.nav-about')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the about page.')
      await browser.close()
    })
  })

  describe('with different types of urls', () => {
    it('should work with normal page', async () => {
      const browser = await next.browser('/with-cdm')
      const text = await browser.elementByCss('p').text()

      expect(text).toBe('ComponentDidMount executed on client.')
      await browser.close()
    })

    it('should work with dir/ page', async () => {
      const browser = await next.browser('/nested-cdm')
      const text = await browser.elementByCss('p').text()

      expect(text).toBe('ComponentDidMount executed on client.')
      await browser.close()
    })

    it('should not work with /index page', async () => {
      const browser = await next.browser('/index')
      expect(await browser.elementByCss('h1').text()).toBe('404')
      expect(await browser.elementByCss('h2').text()).toBe(
        'This page could not be found.'
      )
      await browser.close()
    })

    it('should work with / page', async () => {
      const browser = await next.browser('/')
      const text = await browser.elementByCss('p').text()

      expect(text).toBe('ComponentDidMount executed on client.')
      await browser.close()
    })
  })

  describe('with the HOC based router', () => {
    it('should navigate as expected', async () => {
      const browser = await next.browser('/nav/with-hoc')

      const pathname = await browser.elementByCss('#pathname').text()
      expect(pathname).toBe('Current path: /nav/with-hoc')

      const asPath = await browser.elementByCss('#asPath').text()
      expect(asPath).toBe('Current asPath: /nav/with-hoc')

      const text = await browser
        .elementByCss('.nav-with-hoc a')
        .click()
        .waitForElementByCss('.nav-home')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the home.')
      await browser.close()
    })
  })

  describe('runtime errors', () => {
    it('should show redbox when a client side error is thrown inside a component', async () => {
      const isReact18 = process.env.NEXT_TEST_REACT_VERSION?.startsWith('18')
      const pageErrors: unknown[] = []
      const browser = await next.browser('/error-inside-browser-page', {
        beforePageLoad: (page) => {
          page.on('pageerror', (error: unknown) => {
            pageErrors.push(error)
          })
        },
      })
      await retry(async () => {
        expect(await getRedboxTotalErrorCount(browser)).toBe(isReact18 ? 3 : 1)
      })
      if (isReact18) {
        await expect(browser).toDisplayRedbox(`
         [
           {
             "description": "An Expected error occurred",
             "environmentLabel": null,
             "label": "Runtime Error",
             "source": "pages/error-inside-browser-page.js (5:13) @ ErrorInRenderPage.render
         > 5 |       throw new Error('An Expected error occurred')
             |             ^",
             "stack": [
               "ErrorInRenderPage.render pages/error-inside-browser-page.js (5:13)",
             ],
           },
           {
             "description": "An Expected error occurred",
             "environmentLabel": null,
             "label": "Runtime Error",
             "source": "pages/error-inside-browser-page.js (5:13) @ ErrorInRenderPage.render
         > 5 |       throw new Error('An Expected error occurred')
             |             ^",
             "stack": [
               "ErrorInRenderPage.render pages/error-inside-browser-page.js (5:13)",
             ],
           },
           {
             "description": "There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.",
             "environmentLabel": null,
             "label": "Recoverable Error",
             "source": null,
             "stack": [],
           },
         ]
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "An Expected error occurred",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "pages/error-inside-browser-page.js (5:13) @ ErrorInRenderPage.render
         > 5 |       throw new Error('An Expected error occurred')
             |             ^",
           "stack": [
             "ErrorInRenderPage.render pages/error-inside-browser-page.js (5:13)",
           ],
         }
        `)
      }
      expect(pageErrors).toEqual(
        isReact18
          ? [
              expect.objectContaining({
                message: 'An Expected error occurred',
              }),
              expect.objectContaining({
                message: 'An Expected error occurred',
              }),
              expect.objectContaining({
                message:
                  'There was an error while hydrating. Because the error happened outside of a Suspense boundary, the entire root will switch to client rendering.',
              }),
            ]
          : // TODO(veil): Should contain thrown error
            []
      )
    })

    it('should show redbox when a client side error is thrown outside a component', async () => {
      const pageErrors: unknown[] = []
      const browser = await next.browser('/error-in-the-browser-global-scope', {
        beforePageLoad: (page) => {
          page.on('pageerror', (error: unknown) => {
            pageErrors.push(error)
          })
        },
      })

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
           {
             "description": "An Expected error occurred",
             "environmentLabel": null,
             "label": "Runtime Error",
             "source": "pages/error-in-the-browser-global-scope.js (2:9) @ module evaluation
           > 2 |   throw new Error('An Expected error occurred')
               |         ^",
             "stack": [
               "module evaluation pages/error-in-the-browser-global-scope.js (2:9)",
             ],
           }
          `)
      } else if (isRspack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "An Expected error occurred",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "pages/error-in-the-browser-global-scope.js (2:9) @ eval
         > 2 |   throw new Error('An Expected error occurred')
             |         ^",
           "stack": [
             "eval pages/error-in-the-browser-global-scope.js (2:9)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
           {
             "description": "An Expected error occurred",
             "environmentLabel": null,
             "label": "Runtime Error",
             "source": "pages/error-in-the-browser-global-scope.js (2:9) @ eval
           > 2 |   throw new Error('An Expected error occurred')
               |         ^",
             "stack": [
               "eval pages/error-in-the-browser-global-scope.js (2:9)",
               "<FIXME-next-dist-dir>",
             ],
           }
          `)
      }
      expect(pageErrors).toEqual([
        expect.objectContaining({ message: 'An Expected error occurred' }),
      ])
    })
  })

  it('should not error on module.exports + polyfills', async () => {
    const browser = await next.browser('/read-only-object-error')
    expect(await browser.elementByCss('body').text()).toBe(
      'this is just a placeholder component'
    )
  })

  it('should work on nested /index/index.js', async () => {
    const browser = await next.browser('/nested-index/index')
    expect(await browser.elementByCss('p').text()).toBe(
      'This is an index.js nested in an index/ folder.'
    )
    await browser.close()
  })

  it('should handle undefined prop in head client-side', async () => {
    const browser = await next.browser('/head')
    const value = await browser.eval(
      `document.querySelector('meta[name="empty-content"]').hasAttribute('content')`
    )

    expect(value).toBe(false)
  })

  it.each([true, false])(
    'should handle boolean async prop in next/script client-side: %s',
    async (bool) => {
      const browser = await next.browser('/script')
      const value = await browser.eval(
        `document.querySelector('script[src="/test-async-${JSON.stringify(
          bool
        )}.js"]').async`
      )

      expect(value).toBe(bool)
    }
  )

  it('should only execute async and defer scripts with next/script once', async () => {
    const browser = await next.browser('/script')

    await browser.waitForElementByCss('h1')
    await waitFor(2000)
    expect(Number(await browser.eval('window.__test_async_executions'))).toBe(1)
    expect(Number(await browser.eval('window.__test_defer_executions'))).toBe(1)
  })

  it('should emit routeChangeError on hash change cancel', async () => {
    const browser = await next.browser('/')

    await browser.eval(`(function() {
      window.routeErrors = []

      window.next.router.events.on('routeChangeError', function (err) {
        window.routeErrors.push(err)
      })
      window.next.router.push('#first')
      window.next.router.push('#second')
      window.next.router.push('#third')
    })()`)

    await check(async () => {
      const errorCount = await browser.eval('window.routeErrors.length')
      return errorCount > 0 ? 'success' : errorCount
    }, 'success')
  })

  it('should navigate to paths relative to the current page', async () => {
    const browser = await next.browser('/nav/relative')
    let page

    await browser.elementByCss('a').click()

    await browser.waitForElementByCss('#relative-1')
    page = await browser.elementByCss('body').text()
    expect(page).toMatch(/On relative 1/)
    await browser.elementByCss('a').click()

    await browser.waitForElementByCss('#relative-2')
    page = await browser.elementByCss('body').text()
    expect(page).toMatch(/On relative 2/)

    await browser.elementByCss('button').click()
    await browser.waitForElementByCss('#relative')
    page = await browser.elementByCss('body').text()
    expect(page).toMatch(/On relative index/)

    await browser.close()
  })
})
