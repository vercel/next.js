import { nextTestSetup } from 'e2e-utils'
import { waitForStaticIndicator } from 'next-test-utils'

const withCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('dev indicator - route type', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('getServerSideProps', () => {
    it('should update when going from dynamic -> static', async () => {
      const browser = await next.browser('/pages/gssp')

      await waitForStaticIndicator(browser, 'Dynamic')

      // validate static -> dynamic updates
      await browser.elementByCss("[href='/pages']").click()

      await waitForStaticIndicator(browser, 'Static')
    })

    it('should update when going from static -> dynamic', async () => {
      const browser = await next.browser('/pages')

      await waitForStaticIndicator(browser, 'Static')

      // validate static -> dynamic updates
      await browser.elementByCss("[href='/pages/gssp']").click()

      await waitForStaticIndicator(browser, 'Dynamic')
    })

    it('should be marked dynamic on first load', async () => {
      const browser = await next.browser('/pages/gssp')

      await waitForStaticIndicator(browser, 'Dynamic')
    })
  })

  describe('getInitialProps', () => {
    it('should be marked dynamic on first load', async () => {
      const browser = await next.browser('/pages/gip')

      await waitForStaticIndicator(browser, 'Dynamic')
    })

    it('should update when going from dynamic -> static', async () => {
      const browser = await next.browser('/pages/gip')

      await waitForStaticIndicator(browser, 'Dynamic')

      await browser.elementByCss("[href='/pages']").click()

      await waitForStaticIndicator(browser, 'Static')
    })

    it('should update when going from static -> dynamic', async () => {
      const browser = await next.browser('/pages')

      await waitForStaticIndicator(browser, 'Static')

      await browser.elementByCss("[href='/pages/gip']").click()

      await waitForStaticIndicator(browser, 'Dynamic')
    })
  })

  describe('getStaticPaths', () => {
    it('should be marked static on first load', async () => {
      const browser = await next.browser('/pages/pregenerated')

      await waitForStaticIndicator(browser, 'Static')
    })

    it('should update when going from dynamic -> static', async () => {
      const browser = await next.browser('/pages/gssp')

      await waitForStaticIndicator(browser, 'Dynamic')

      await browser.elementByCss("[href='/pages/pregenerated']").click()

      await waitForStaticIndicator(browser, 'Static')
    })
  })

  it('should have route type as static by default for static page', async () => {
    const browser = await next.browser('/pages')

    await waitForStaticIndicator(browser, 'Static')
  })

  describe('with App Router', () => {
    describe('when loading a dynamic page', () => {
      if (withCacheComponents) {
        describe('with Cache Components enabled', () => {
          it('should not show a static indicator', async () => {
            const browser = await next.browser('/app/static-indicator/dynamic')
            await waitForStaticIndicator(browser, undefined)
          })

          it('should still show a static indicator when navigating to a Pages Router page', async () => {
            const browser = await next.browser('/app/static-indicator/dynamic')
            await waitForStaticIndicator(browser, undefined)

            await browser.elementByCss("[href='/pages']").click()

            await waitForStaticIndicator(browser, 'Static')
          })
        })
      } else {
        describe('with Cache Components disabled', () => {
          it('should be marked dynamic on first load', async () => {
            const browser = await next.browser('/app/static-indicator/dynamic')

            await waitForStaticIndicator(browser, 'Dynamic')
          })

          it('should update when going from dynamic -> static', async () => {
            const browser = await next.browser('/app/static-indicator/dynamic')

            await waitForStaticIndicator(browser, 'Dynamic')

            await browser
              .elementByCss("[href='/app/static-indicator/static']")
              .click()

            await waitForStaticIndicator(browser, 'Static')
          })
        })
      }
    })

    describe('when loading a static page', () => {
      if (withCacheComponents) {
        describe('with Cache Components enabled', () => {
          it('should not show a static indicator', async () => {
            const browser = await next.browser('/app/static-indicator/static')
            await waitForStaticIndicator(browser, undefined)
          })

          it('should still show a static indicator when navigating to a Pages Router page', async () => {
            const browser = await next.browser('/app/static-indicator/static')
            await waitForStaticIndicator(browser, undefined)

            await browser.elementByCss("[href='/pages/gssp']").click()

            await waitForStaticIndicator(browser, 'Dynamic')
          })
        })
      } else {
        describe('with Cache Components disabled', () => {
          it('should be marked static on first load', async () => {
            const browser = await next.browser('/app/static-indicator/static')

            await waitForStaticIndicator(browser, 'Static')
          })

          it('should update when going from static -> dynamic', async () => {
            const browser = await next.browser('/app/static-indicator/static')

            await waitForStaticIndicator(browser, 'Static')

            await browser
              .elementByCss("[href='/app/static-indicator/dynamic']")
              .click()

            await waitForStaticIndicator(browser, 'Dynamic')
          })
        })
      }
    })
  })
})
