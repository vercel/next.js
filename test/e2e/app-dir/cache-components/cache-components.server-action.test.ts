import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox, retry } from 'next-test-utils'

describe('cache-components', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  if (isNextStart) {
    it('should not handle a server action again during stale page revalidation', async () => {
      const browser = await next.browser('/server-action-stale-revalidation')
      await browser.waitForIdleNetwork()
      expect(await browser.elementByCss('#action-count').text()).toBe('0')

      let cacheGeneratedAt = Number(
        await browser
          .elementByCss('#action-count')
          .getAttribute('data-generated-at')
      )
      await retry(async () => {
        await browser.eval('window.next.router.refresh()')
        const refreshedCacheGeneratedAt = Number(
          await browser
            .elementByCss('#action-count')
            .getAttribute('data-generated-at')
        )
        expect(refreshedCacheGeneratedAt).toBeGreaterThan(cacheGeneratedAt)
        cacheGeneratedAt = refreshedCacheGeneratedAt
      })

      await retry(async () => {
        expect(Date.now() - cacheGeneratedAt).toBeGreaterThan(1000)
      })

      let actionResponseStatus: number | undefined
      browser.on('response', (response) => {
        if (
          response.request().method() === 'POST' &&
          response.url().includes('/server-action-stale-revalidation')
        ) {
          actionResponseStatus = response.status()
        }
      })

      await browser.elementByCss('button').click()

      await retry(async () => {
        expect(actionResponseStatus).toBe(200)
        expect(await browser.elementByCss('#action-result').text()).toBe('1')
      })

      await retry(async () => {
        await browser.eval('window.next.router.refresh()')
        await browser.waitForIdleNetwork()
        expect(await browser.elementByCss('#action-count').text()).toBe('1')
      })
      expect(next.cliOutput).not.toContain(
        'Error revalidating the page in the background'
      )
    })
  }

  it('should not fail decoding server action arguments', async () => {
    const browser = await next.browser('/server-action')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('result')
    })
  })

  it('should not have cache components errors when encoding bound args for inline server actions', async () => {
    const browser = await next.browser('/server-action-inline')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    if (isNextDev) {
      await waitForNoRedbox(browser)
    }

    await browser.elementByCss('button').click()
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(
        'result and more and even more'
      )
    })

    expect(next.cliOutput).not.toInclude('Error: Route "/server-action-inline"')
  })

  it('should prerender pages with inline server actions', async () => {
    let $ = await next.render$('/server-action-inline', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })
})
