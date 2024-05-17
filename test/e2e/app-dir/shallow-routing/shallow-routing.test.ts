import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('shallow-routing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('pushState', () => {
    it('should support setting data', async () => {
      const browser = await next.browser('/a')
      expect(
        await browser
          .elementByCss('#to-pushstate-data')
          .click()
          .waitForElementByCss('#pushstate-data')
          .text()
      ).toBe('PushState Data')
      await browser
        .elementByCss('#push-state')
        .click()
        .waitForElementByCss('#state-updated')
        .elementByCss('#get-latest')
        .click()
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toMatch(
          `{"foo":"bar"}`
        )
      })
    })

    it('should support setting a different pathname reflected on usePathname', async () => {
      const browser = await next.browser('/a')
      expect(
        await browser
          .elementByCss('#to-pushstate-new-pathname')
          .click()
          .waitForElementByCss('#pushstate-pathname')
          .text()
      ).toBe('PushState Pathname')

      await browser.elementByCss('#push-pathname').click()

      // Check usePathname value is the new pathname
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual(
          '/my-non-existent-path'
        )
      })

      // Check current url is the new pathname
      expect(await browser.url()).toBe(`${next.url}/my-non-existent-path`)
    })

    it('should support setting a different searchParam reflected on useSearchParams', async () => {
      const browser = await next.browser('/a')
      expect(
        await browser
          .elementByCss('#to-pushstate-new-searchparams')
          .click()
          .waitForElementByCss('#pushstate-searchparams')
          .text()
      ).toBe('PushState SearchParams')

      await browser.elementByCss('#push-searchparams').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual('foo')
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/pushstate-new-searchparams?query=foo`
      )

      // Same cycle a second time
      await browser.elementByCss('#push-searchparams').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual(
          'foo-added'
        )
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/pushstate-new-searchparams?query=foo-added`
      )
    })

    it('should support setting a different url using a string', async () => {
      const browser = await next.browser('/a')
      expect(
        await browser
          .elementByCss('#to-pushstate-string-url')
          .click()
          .waitForElementByCss('#pushstate-string-url')
          .text()
      ).toBe('PushState String Url')

      await browser.elementByCss('#push-string-url').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual('foo')
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/pushstate-string-url?query=foo`
      )

      // Same cycle a second time
      await browser.elementByCss('#push-string-url').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual(
          'foo-added'
        )
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/pushstate-string-url?query=foo-added`
      )
    })

    it('should work when given a null state value', async () => {
      const browser = await next.browser('/a')
      expect(
        await browser
          .elementByCss('#to-pushstate-string-url')
          .click()
          .waitForElementByCss('#pushstate-string-url')
          .text()
      ).toBe('PushState String Url')

      await browser.elementByCss('#push-string-url-null').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual('foo')
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/pushstate-string-url?query=foo`
      )

      // Same cycle a second time
      await browser.elementByCss('#push-string-url-null').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual(
          'foo-added'
        )
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/pushstate-string-url?query=foo-added`
      )
    })
  })

  it('should work when given an undefined state value', async () => {
    const browser = await next.browser('/a')
    expect(
      await browser
        .elementByCss('#to-pushstate-string-url')
        .click()
        .waitForElementByCss('#pushstate-string-url')
        .text()
    ).toBe('PushState String Url')

    await browser.elementByCss('#push-string-url-undefined').click()

    // Check useSearchParams value is the new searchparam
    await retry(async () => {
      expect(await browser.elementByCss('#my-data').text()).toEqual('foo')
    })

    // Check current url is the new searchparams
    expect(await browser.url()).toBe(
      `${next.url}/pushstate-string-url?query=foo`
    )

    // Same cycle a second time
    await browser.elementByCss('#push-string-url-undefined').click()

    // Check useSearchParams value is the new searchparam
    await retry(async () => {
      expect(await browser.elementByCss('#my-data').text()).toEqual('foo-added')
    })

    // Check current url is the new searchparams
    expect(await browser.url()).toBe(
      `${next.url}/pushstate-string-url?query=foo-added`
    )
  })

  describe('replaceState', () => {
    it('should support setting data', async () => {
      const browser = await next.browser('/a')
      expect(
        await browser
          .elementByCss('#to-replacestate-data')
          .click()
          .waitForElementByCss('#replacestate-data')
          .text()
      ).toBe('ReplaceState Data')
      await browser
        .elementByCss('#replace-state')
        .click()
        .waitForElementByCss('#state-updated')
        .elementByCss('#get-latest')
        .click()
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toMatch(
          `{"foo":"bar"}`
        )
      })
    })

    it('should support setting a different pathname reflected on usePathname', async () => {
      const browser = await next.browser('/a')
      expect(
        await browser
          .elementByCss('#to-replacestate-new-pathname')
          .click()
          .waitForElementByCss('#replacestate-pathname')
          .text()
      ).toBe('ReplaceState Pathname')

      await browser.elementByCss('#replace-pathname').click()

      // Check usePathname value is the new pathname
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual(
          '/my-non-existent-path'
        )
      })

      // Check current url is the new pathname
      expect(await browser.url()).toBe(`${next.url}/my-non-existent-path`)
    })

    it('should support setting a different searchParam reflected on useSearchParams', async () => {
      const browser = await next.browser('/a')
      expect(
        await browser
          .elementByCss('#to-replacestate-new-searchparams')
          .click()
          .waitForElementByCss('#replacestate-searchparams')
          .text()
      ).toBe('ReplaceState SearchParams')

      await browser.elementByCss('#replace-searchparams').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual('foo')
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/replacestate-new-searchparams?query=foo`
      )

      // Same cycle a second time
      await browser.elementByCss('#replace-searchparams').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual(
          'foo-added'
        )
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/replacestate-new-searchparams?query=foo-added`
      )
    })

    it('should support setting a different url using a string', async () => {
      const browser = await next.browser('/a')
      expect(
        await browser
          .elementByCss('#to-replacestate-string-url')
          .click()
          .waitForElementByCss('#replacestate-string-url')
          .text()
      ).toBe('ReplaceState String Url')

      await browser.elementByCss('#replace-string-url').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual('foo')
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/replacestate-string-url?query=foo`
      )

      // Same cycle a second time
      await browser.elementByCss('#replace-string-url').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual(
          'foo-added'
        )
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/replacestate-string-url?query=foo-added`
      )
    })

    it('should work when given a null state value', async () => {
      const browser = await next.browser('/a')
      expect(
        await browser
          .elementByCss('#to-replacestate-string-url')
          .click()
          .waitForElementByCss('#replacestate-string-url')
          .text()
      ).toBe('ReplaceState String Url')

      await browser.elementByCss('#replace-string-url-null').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual('foo')
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/replacestate-string-url?query=foo`
      )

      // Same cycle a second time
      await browser.elementByCss('#replace-string-url-null').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual(
          'foo-added'
        )
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/replacestate-string-url?query=foo-added`
      )
    })

    it('should work when given an undefined state value', async () => {
      const browser = await next.browser('/a')
      expect(
        await browser
          .elementByCss('#to-replacestate-string-url')
          .click()
          .waitForElementByCss('#replacestate-string-url')
          .text()
      ).toBe('ReplaceState String Url')

      await browser.elementByCss('#replace-string-url-undefined').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual('foo')
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/replacestate-string-url?query=foo`
      )

      // Same cycle a second time
      await browser.elementByCss('#replace-string-url-undefined').click()

      // Check useSearchParams value is the new searchparam
      await retry(async () => {
        expect(await browser.elementByCss('#my-data').text()).toEqual(
          'foo-added'
        )
      })

      // Check current url is the new searchparams
      expect(await browser.url()).toBe(
        `${next.url}/replacestate-string-url?query=foo-added`
      )
    })
  })

  describe('back and forward', () => {
    describe('client-side navigation', () => {
      it('should support setting a different pathname reflected on usePathname and then still support navigating back and forward', async () => {
        const browser = await next.browser('/a')
        expect(
          await browser
            .elementByCss('#to-pushstate-new-pathname')
            .click()
            .waitForElementByCss('#pushstate-pathname')
            .text()
        ).toBe('PushState Pathname')

        await browser.elementByCss('#push-pathname').click()

        // Check usePathname value is the new pathname
        await retry(async () => {
          expect(await browser.elementByCss('#my-data').text()).toEqual(
            '/my-non-existent-path'
          )
        })

        // Check current url is the new pathname
        expect(await browser.url()).toBe(`${next.url}/my-non-existent-path`)

        // Navigate back
        await browser.back()

        // Check usePathname value is the old pathname
        await retry(async () => {
          expect(await browser.elementByCss('#my-data').text()).toEqual(
            '/pushstate-new-pathname'
          )
        })

        await browser.forward()

        // Check usePathname value is the old pathname
        await retry(async () => {
          expect(await browser.elementByCss('#my-data').text()).toEqual(
            '/my-non-existent-path'
          )
        })
      })
    })

    // Browser navigation using `<a>` and such.
    describe('mpa navigation', () => {
      it('should support setting data and then still support navigating back and forward', async () => {
        const browser = await next.browser('/a')
        expect(
          await browser
            .elementByCss('#to-pushstate-data')
            .click()
            .waitForElementByCss('#pushstate-data')
            .text()
        ).toBe('PushState Data')
        await browser
          .elementByCss('#push-state')
          .click()
          .waitForElementByCss('#state-updated')
          .elementByCss('#get-latest')
          .click()

        await retry(async () => {
          expect(await browser.elementByCss('#my-data').text()).toMatch(
            `{"foo":"bar"}`
          )
        })

        expect(
          await browser
            .elementByCss('#to-a-mpa')
            .click()
            .waitForElementByCss('#page-a')
            .text()
        ).toBe('Page A')

        // Navigate back
        await browser.back()

        // Check usePathname value is the old pathname
        await retry(async () => {
          expect(await browser.elementByCss('#my-data').text()).toMatch(
            `{"foo":"bar"}`
          )
        })

        await browser.forward()

        await retry(async () => {
          expect(
            await browser
              .elementByCss('#to-a-mpa')
              .click()
              .waitForElementByCss('#page-a')
              .text()
          ).toEqual('Page A')
        })
      })

      it('should support hash navigations while continuing to work for pushState/replaceState APIs', async () => {
        const browser = await next.browser('/a')
        expect(
          await browser
            .elementByCss('#to-pushstate-string-url')
            .click()
            .waitForElementByCss('#pushstate-string-url')
            .text()
        ).toBe('PushState String Url')

        await browser.elementByCss('#hash-navigation').click()

        // Check current url contains the hash
        expect(await browser.url()).toBe(
          `${next.url}/pushstate-string-url#content`
        )

        await browser.elementByCss('#push-string-url').click()

        // Check useSearchParams value is the new searchparam
        await retry(async () => {
          expect(await browser.elementByCss('#my-data').text()).toEqual('foo')
        })

        // Check current url is the new searchparams
        expect(await browser.url()).toBe(
          `${next.url}/pushstate-string-url?query=foo`
        )

        // Same cycle a second time
        await browser.elementByCss('#push-string-url').click()

        // Check useSearchParams value is the new searchparam
        await retry(async () => {
          expect(await browser.elementByCss('#my-data').text()).toEqual(
            'foo-added'
          )
        })

        // Check current url is the new searchparams
        expect(await browser.url()).toBe(
          `${next.url}/pushstate-string-url?query=foo-added`
        )
      })
    })
  })
})
