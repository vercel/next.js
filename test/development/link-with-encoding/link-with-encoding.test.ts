import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Link Component with Encoding', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('spaces', () => {
    it('should have correct query on SSR', async () => {
      const browser = await next.browser(encodeURI('/single/hello world '))
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toMatchInlineSnapshot(`"{"slug":"hello world "}"`)
    })

    it('should have correct query on Router#push', async () => {
      const browser = await next.browser('/')
      await browser.eval(
        `window.next.router.push(
          { pathname: '/single/[slug]' },
          { pathname: encodeURI('/single/hello world ') }
        )`
      )
      await retry(async () => {
        expect(await browser.hasElementByCssSelector('#query-content')).toBe(
          true
        )
      })
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toMatchInlineSnapshot(`"{"slug":"hello world "}"`)
    })

    it('should have correct query on simple client-side <Link>', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('#single-spaces').click()
      await retry(async () => {
        expect(await browser.hasElementByCssSelector('#query-content')).toBe(
          true
        )
      })
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toMatchInlineSnapshot(`"{"slug":"hello world "}"`)
    })
  })

  describe('percent', () => {
    it('should have correct query on SSR', async () => {
      const browser = await next.browser(encodeURI('/single/hello%world'))
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toMatchInlineSnapshot(`"{"slug":"hello%world"}"`)
    })

    it('should have correct query on Router#push', async () => {
      const browser = await next.browser('/')
      await browser.eval(
        `window.next.router.push(
          { pathname: '/single/[slug]' },
          { pathname: encodeURI('/single/hello%world') }
        )`
      )
      await retry(async () => {
        expect(await browser.hasElementByCssSelector('#query-content')).toBe(
          true
        )
      })
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toMatchInlineSnapshot(`"{"slug":"hello%world"}"`)
    })

    it('should have correct query on simple client-side <Link>', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('#single-percent').click()
      await retry(async () => {
        expect(await browser.hasElementByCssSelector('#query-content')).toBe(
          true
        )
      })
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toMatchInlineSnapshot(`"{"slug":"hello%world"}"`)
    })
  })

  describe('forward slash', () => {
    it('should have correct query on SSR', async () => {
      const browser = await next.browser(
        `/single/hello${encodeURIComponent('/')}world`
      )
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toMatchInlineSnapshot(`"{"slug":"hello/world"}"`)
    })

    it('should have correct query on Router#push', async () => {
      const browser = await next.browser('/')
      await browser.eval(
        `window.next.router.push(
          { pathname: '/single/[slug]' },
          { pathname: '/single/hello${encodeURIComponent('/')}world' }
        )`
      )
      await retry(async () => {
        expect(await browser.hasElementByCssSelector('#query-content')).toBe(
          true
        )
      })
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toMatchInlineSnapshot(`"{"slug":"hello/world"}"`)
    })

    it('should have correct query on simple client-side <Link>', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('#single-slash').click()
      await retry(async () => {
        expect(await browser.hasElementByCssSelector('#query-content')).toBe(
          true
        )
      })
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toMatchInlineSnapshot(`"{"slug":"hello/world"}"`)
    })
  })

  describe('double quote', () => {
    it('should have correct query on SSR', async () => {
      const browser = await next.browser(
        `/single/hello${encodeURIComponent('"')}world`
      )
      const text = await browser.elementByCss('#query-content').text()
      expect(JSON.parse(text)).toMatchInlineSnapshot(`
        {
          "slug": "hello"world",
        }
      `)
    })

    it('should have correct query on Router#push', async () => {
      const browser = await next.browser('/')
      await browser.eval(
        `window.next.router.push(
          { pathname: '/single/[slug]' },
          { pathname: '/single/hello${encodeURIComponent('"')}world' }
        )`
      )
      await retry(async () => {
        expect(await browser.hasElementByCssSelector('#query-content')).toBe(
          true
        )
      })
      const text = await browser.elementByCss('#query-content').text()
      expect(JSON.parse(text)).toMatchInlineSnapshot(`
        {
          "slug": "hello"world",
        }
      `)
    })

    it('should have correct query on simple client-side <Link>', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('#single-double-quote').click()
      await retry(async () => {
        expect(await browser.hasElementByCssSelector('#query-content')).toBe(
          true
        )
      })
      const text = await browser.elementByCss('#query-content').text()
      expect(JSON.parse(text)).toMatchInlineSnapshot(`
        {
          "slug": "hello"world",
        }
      `)
    })
  })

  describe('colon', () => {
    it('should have correct query on SSR', async () => {
      const browser = await next.browser(
        `/single/hello${encodeURIComponent(':')}world`
      )
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toMatchInlineSnapshot(`"{"slug":"hello:world"}"`)
    })

    it('should have correct query on Router#push', async () => {
      const browser = await next.browser('/')
      await browser.eval(
        `window.next.router.push(
          { pathname: '/single/[slug]' },
          { pathname: '/single/hello${encodeURIComponent(':')}world' }
        )`
      )
      await retry(async () => {
        expect(await browser.hasElementByCssSelector('#query-content')).toBe(
          true
        )
      })
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toMatchInlineSnapshot(`"{"slug":"hello:world"}"`)
    })

    it('should have correct query on simple client-side <Link>', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('#single-colon').click()
      await retry(async () => {
        expect(await browser.hasElementByCssSelector('#query-content')).toBe(
          true
        )
      })
      const text = await browser.elementByCss('#query-content').text()
      expect(text).toMatchInlineSnapshot(`"{"slug":"hello:world"}"`)
    })

    it('should have correct parsing of url query params', async () => {
      const browser = await next.browser('/')
      await browser.waitForElementByCss('#url-param').click()
      const content = await browser.waitForElementByCss('#query-content').text()
      const query = JSON.parse(content)
      expect(query).toHaveProperty('id', 'http://example.com/')
    })
  })
})
