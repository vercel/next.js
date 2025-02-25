import { nextTestSetup } from 'e2e-utils'
import { getRouteTypeFromDevToolsIndicator, retry } from 'next-test-utils'

describe('dev indicator - route type', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have route type as static by default for static page', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(await getRouteTypeFromDevToolsIndicator(browser)).toBe('Static')
    })
  })

  describe('getStaticPaths', () => {
    it('should be marked static on first load', async () => {
      const browser = await next.browser('/pregenerated')

      await retry(async () => {
        expect(await getRouteTypeFromDevToolsIndicator(browser)).toBe('Static')
      })
    })

    it('should update when going from dynamic -> static', async () => {
      const browser = await next.browser('/gssp')

      await retry(async () => {
        expect(await getRouteTypeFromDevToolsIndicator(browser)).toBe('Dynamic')
      })

      await browser.elementByCss("[href='/pregenerated']").click()

      await retry(async () => {
        expect(await getRouteTypeFromDevToolsIndicator(browser)).toBe('Static')
      })
    })
  })

  describe('getServerSideProps', () => {
    it('should update when going from static -> dynamic', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        expect(await getRouteTypeFromDevToolsIndicator(browser)).toBe('Static')
      })

      // validate static -> dynamic updates
      await browser.elementByCss("[href='/gssp']").click()

      await retry(async () => {
        expect(await getRouteTypeFromDevToolsIndicator(browser)).toBe('Dynamic')
      })
    })

    it('should update when going from dynamic -> static', async () => {
      const browser = await next.browser('/gssp')

      await retry(async () => {
        expect(await getRouteTypeFromDevToolsIndicator(browser)).toBe('Dynamic')
      })

      // validate static -> dynamic updates
      await browser.elementByCss("[href='/']").click()

      await retry(async () => {
        expect(await getRouteTypeFromDevToolsIndicator(browser)).toBe('Static')
      })
    })

    it('should be marked dynamic on first load', async () => {
      const browser = await next.browser('/gssp')

      await retry(async () => {
        expect(await getRouteTypeFromDevToolsIndicator(browser)).toBe('Dynamic')
      })
    })
  })
})
