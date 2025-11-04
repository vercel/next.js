import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('interception-dynamic-segment', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should work when interception route is paired with a dynamic segment', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('[href="/foo/1"]').click()
    await browser.waitForIdleNetwork()

    await retry(async () => {
      expect(await browser.elementById('modal').text()).toEqual('intercepted')
    })

    await browser.refresh()
    await browser.waitForIdleNetwork()

    await retry(async () => {
      expect(await browser.elementById('modal').text()).toEqual('catch-all')
    })
    await retry(async () => {
      expect(await browser.elementById('children').text()).toEqual(
        'not intercepted'
      )
    })
  })

  it('should intercept consistently with back/forward navigation', async () => {
    // Test that the fix works with browser back/forward navigation
    const browser = await next.browser('/')

    // Navigate with interception
    await browser.elementByCss('[href="/foo/1"]').click()
    await browser.waitForIdleNetwork()

    await retry(async () => {
      expect(await browser.elementById('modal').text()).toEqual('intercepted')
    })

    // Go back to root
    await browser.back()
    await browser.waitForIdleNetwork()

    await retry(async () => {
      const url = await browser.url()
      expect(url).toContain('/')
    })

    // Go forward - should show intercepted version
    await browser.forward()
    await browser.waitForIdleNetwork()

    await retry(async () => {
      expect(await browser.elementById('modal').text()).toEqual('intercepted')
    })
  })

  it('should intercept multiple times from root', async () => {
    // Test that repeated interception from root works
    const browser = await next.browser('/')

    for (let i = 0; i < 2; i++) {
      await browser.elementByCss('[href="/foo/1"]').click()
      await browser.waitForIdleNetwork()

      await retry(async () => {
        expect(await browser.elementById('modal').text()).toEqual('intercepted')
      })

      await browser.back()
      await browser.waitForIdleNetwork()

      await retry(async () => {
        const url = await browser.url()
        expect(url).toMatch(/\/$/)
      })
    }
  })

  if (isNextStart) {
    it('should correctly prerender segments with generateStaticParams', async () => {
      expect(next.cliOutput).toContain('/generate-static-params/a')
      const res = await next.fetch('/generate-static-params/a')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-nextjs-cache')).toBe('HIT')
    })

    if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
      it('should not render a 404 for the intercepted route', async () => {
        const meta = JSON.parse(
          await next.readFile('.next/server/app/(.)[username]/[id].meta')
        )

        expect(meta.status).toBe(200)
      })
    }
  }
})
