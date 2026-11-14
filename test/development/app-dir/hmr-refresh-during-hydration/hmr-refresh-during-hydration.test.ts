import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('hmr-refresh-during-hydration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('applies a server component change that arrives while the page is hydrating', async () => {
    const browser = await next.browser('/', { waitHydration: false })
    expect(await browser.elementByCss('#status').text()).toBe('hydrating')

    await next.patchFile('app/page.tsx', (content) =>
      content.replace('>before<', '>after<')
    )

    await retry(async () => {
      expect(await browser.elementByCss('#status').text()).toBe('hydrated')
      expect(await browser.elementByCss('#server-text').text()).toBe('after')
    }, 20_000)

    // Refreshing before the router had mounted logged "Can't perform a React
    // state update on a component that hasn't mounted yet" and hydrated the
    // new server output against the old HTML.
    const errors = (await browser.log()).filter((log) => log.source === 'error')
    expect(errors).toEqual([])
  })
})
