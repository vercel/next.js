import { createNextDescribe } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { check } from 'next-test-utils'

createNextDescribe(
  'app dir - navigation',
  {
    files: __dirname,
  },
  ({ next, isNextDev, isNextDeploy }) => {
    describe('query string', () => {
      it('should set query correctly', async () => {
        const browser = await webdriver(next.url, '/')
        expect(await browser.elementById('query').text()).toMatchInlineSnapshot(
          `""`
        )

        browser.elementById('set-query').click()

        await check(
          async () => await browser.elementById('query').text(),
          'a=b&c=d'
        )

        const url = new URL(await browser.url())
        expect(url.searchParams.toString()).toMatchInlineSnapshot(`"a=b&c=d"`)
      })
    })

    describe('hash', () => {
      it('should scroll to the specified hash', async () => {
        const browser = await next.browser('/hash')

        const checkLink = async (
          val: number | string,
          expectedScroll: number
        ) => {
          await browser.elementByCss(`#link-to-${val.toString()}`).click()
          await check(
            async () => {
              const val = await browser.eval('window.pageYOffset')
              return val.toString()
            },
            expectedScroll.toString(),
            true,
            // Try maximum of 15 seconds
            15
          )
        }

        await checkLink(6, 114)
        await checkLink(50, 730)
        await checkLink(160, 2270)
        await checkLink(300, 4230)
        await checkLink('top', 0)
        await checkLink('non-existent', 0)
      })
    })

    describe('hash-link-back-to-same-page', () => {
      it('should scroll to the specified hash', async () => {
        const browser = await next.browser('/hash-link-back-to-same-page')

        const checkLink = async (
          val: number | string,
          expectedScroll: number
        ) => {
          await browser.elementByCss(`#link-to-${val.toString()}`).click()
          await check(
            async () => {
              const val = await browser.eval('window.pageYOffset')
              return val.toString()
            },
            expectedScroll.toString(),
            true,
            // Try maximum of 15 seconds
            15
          )
        }

        await checkLink(6, 114)
        await checkLink(50, 730)
        await checkLink(160, 2270)

        await browser
          .elementByCss('#to-other-page')
          // Navigate to other
          .click()
          // Wait for other ot load
          .waitForElementByCss('#link-to-home')
          // Navigate back to hash-link-back-to-same-page
          .click()
          // Wait for hash-link-back-to-same-page to load
          .waitForElementByCss('#to-other-page')

        await check(
          async () => {
            const val = await browser.eval('window.pageYOffset')
            return val.toString()
          },
          (0).toString(),
          true,
          // Try maximum of 15 seconds
          15
        )
      })
    })

    describe('not-found', () => {
      it('should trigger not-found in a server component', async () => {
        const browser = await next.browser('/not-found/servercomponent')

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
        const browser = await next.browser('/not-found/clientcomponent')
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
        const browser = await next.browser('/not-found/client-side')
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
      it('should trigger not-found while streaming', async () => {
        const browser = await next.browser('/not-found/suspense')
        expect(
          await browser.waitForElementByCss('#not-found-component').text()
        ).toBe('Not Found!')
        expect(
          await browser
            .waitForElementByCss('meta[name="robots"]')
            .getAttribute('content')
        ).toBe('noindex')
      })
    })

    describe('bots', () => {
      if (!isNextDeploy) {
        it('should block rendering for bots and return 404 status', async () => {
          const res = await next.fetch('/not-found/servercomponent', {
            headers: {
              'User-Agent': 'Googlebot',
            },
          })

          expect(res.status).toBe(404)
          expect(await res.text()).toInclude('"noindex"')
        })
      }
    })

    describe('redirect', () => {
      describe('components', () => {
        it('should redirect in a server component', async () => {
          const browser = await next.browser('/redirect/servercomponent')
          await browser.waitForElementByCss('#result-page')
          expect(await browser.elementByCss('#result-page').text()).toBe(
            'Result Page'
          )
        })

        it('should redirect in a client component', async () => {
          const browser = await next.browser('/redirect/clientcomponent')
          await browser.waitForElementByCss('#result-page')
          expect(await browser.elementByCss('#result-page').text()).toBe(
            'Result Page'
          )
        })

        it('should redirect client-side', async () => {
          const browser = await next.browser('/redirect/client-side')
          await browser
            .elementByCss('button')
            .click()
            .waitForElementByCss('#result-page')
          // eslint-disable-next-line jest/no-standalone-expect
          expect(await browser.elementByCss('#result-page').text()).toBe(
            'Result Page'
          )
        })

        it('should redirect to external url', async () => {
          const browser = await next.browser('/redirect/external')
          expect(await browser.waitForElementByCss('h1').text()).toBe(
            'Example Domain'
          )
        })

        it('should redirect to external url, initiating only once', async () => {
          const storageKey = Math.random()
          const browser = await next.browser(
            `/redirect/external-log/${storageKey}`
          )
          expect(await browser.waitForElementByCss('h1').text()).toBe(
            'Example Domain'
          )

          // Now check the logs...
          await browser.get(
            `${next.url}/redirect/external-log/${storageKey}?read=1`
          )
          const stored = JSON.parse(await browser.elementByCss('pre').text())

          if (stored['navigation-supported'] === 'false') {
            // Old browser. Can't know how many times we navigated. Oh well.
            return
          }

          expect(stored['navigation-supported']).toEqual('true')

          // This one is a bit flaky during dev, original notes by @sophiebits:
          // > Not actually sure why this is '2' in dev. Possibly something
          // > related to an update triggered by <HotReload>?
          expect(stored['navigate-https://example.vercel.sh/']).toBeOneOf(
            isNextDev ? ['1', '2'] : ['1']
          )
        })
      })

      describe('next.config.js redirects', () => {
        it('should redirect from next.config.js', async () => {
          const browser = await next.browser('/redirect/a')
          expect(await browser.elementByCss('h1').text()).toBe('redirect-dest')
          expect(await browser.url()).toBe(next.url + '/redirect-dest')
        })

        it('should redirect from next.config.js with link navigation', async () => {
          const browser = await next.browser('/redirect/next-config-redirect')
          await browser
            .elementByCss('#redirect-a')
            .click()
            .waitForElementByCss('h1')
          expect(await browser.elementByCss('h1').text()).toBe('redirect-dest')
          expect(await browser.url()).toBe(next.url + '/redirect-dest')
        })
      })

      describe('middleware redirects', () => {
        it('should redirect from middleware', async () => {
          const browser = await next.browser(
            '/redirect-middleware-to-dashboard'
          )
          expect(await browser.elementByCss('h1').text()).toBe('redirect-dest')
          expect(await browser.url()).toBe(next.url + '/redirect-dest')
        })

        it('should redirect from middleware with link navigation', async () => {
          const browser = await next.browser(
            '/redirect/next-middleware-redirect'
          )
          await browser
            .elementByCss('#redirect-middleware')
            .click()
            .waitForElementByCss('h1')
          expect(await browser.elementByCss('h1').text()).toBe('redirect-dest')
          expect(await browser.url()).toBe(next.url + '/redirect-dest')
        })
      })

      describe('status code', () => {
        it('should respond with 307 status code in server component', async () => {
          const res = await next.fetch('/redirect/servercomponent', {
            redirect: 'manual',
          })
          expect(res.status).toBe(307)
        })
        it('should respond with 307 status code in client component', async () => {
          const res = await next.fetch('/redirect/clientcomponent', {
            redirect: 'manual',
          })
          expect(res.status).toBe(307)
        })
      })
    })

    describe('external push', () => {
      it('should push external url without affecting hooks', async () => {
        // Log with sessionStorage to persist across navigations
        const storageKey = Math.random()
        const browser = await next.browser(`/external-push/${storageKey}`)
        await browser.elementByCss('#go').click()
        await browser.waitForCondition(
          'window.location.origin === "https://example.vercel.sh"'
        )

        // Now check the logs...
        await browser.get(`${next.url}/external-push/${storageKey}`)
        const stored = JSON.parse(await browser.elementByCss('pre').text())
        let expected = {
          // Only one navigation
          'navigate-https://example.vercel.sh/stuff?abc=123': '1',
          'navigation-supported': 'true',
          // Make sure /stuff?abc=123 is not logged here
          [`path-/external-push/${storageKey}`]: 'true',
          // isPending should have been true until the page unloads
          lastIsPending: 'true',
        }

        if (stored['navigation-supported'] !== 'true') {
          // Old browser. Can't know how many times we navigated. Oh well.
          expected['navigation-supported'] = 'false'
          for (const key in expected) {
            if (key.startsWith('navigate-')) {
              delete expected[key]
            }
          }
        }

        expect(stored).toEqual(expected)
      })
    })

    describe('nested navigation', () => {
      it('should navigate to nested pages', async () => {
        const browser = await next.browser('/nested-navigation')
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

    describe('SEO', () => {
      it('should emit noindex meta tag for not found page when streaming', async () => {
        const noIndexTag = '<meta name="robots" content="noindex"/>'
        const defaultViewportTag =
          '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
        const html = await next.render('/not-found/suspense')
        expect(html).toContain(noIndexTag)
        // only contain once
        expect(html.split(noIndexTag).length).toBe(2)
        expect(html.split(defaultViewportTag).length).toBe(2)
      })

      it('should emit refresh meta tag for redirect page when streaming', async () => {
        const html = await next.render('/redirect/suspense')
        expect(html).toContain(
          '<meta http-equiv="refresh" content="0;url=/redirect/result"/>'
        )
      })

      it('should contain default meta tags in error page', async () => {
        const html = await next.render('/not-found/servercomponent')
        expect(html).toContain('<meta name="robots" content="noindex"/>')
        expect(html).toContain(
          '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
        )
      })

      it('should not log 404 errors in ipc server', async () => {
        await next.fetch('/this-path-does-not-exist')
        expect(next.cliOutput).not.toInclude(
          'PageNotFoundError: Cannot find module for page'
        )
      })
    })
  }
)
