import { createNextDescribe } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { check } from 'next-test-utils'

createNextDescribe(
  'app dir - navigation',
  {
    files: __dirname,
    dependencies: {
      swr: 'latest',
      react: 'latest',
      'react-dom': 'latest',
      sass: 'latest',
    },
  },
  ({ next, isNextDeploy }) => {
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
        const initialHtml = await next.render('/not-found/suspense')
        expect(initialHtml).not.toContain('noindex')

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
          const res = await next.fetch('/redirect/servercomponent')
          expect(res.status).toBe(307)
        })
        it('should respond with 307 status code in client component', async () => {
          const res = await next.fetch('/redirect/clientcomponent')
          expect(res.status).toBe(307)
        })
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
  }
)
