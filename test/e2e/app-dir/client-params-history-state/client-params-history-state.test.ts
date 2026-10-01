import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('client-params-history-state', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not suspend client params when the URL is written with history.replaceState', async () => {
    const browser = await next.browser('/1')
    expect(await browser.elementByCss('#id').text()).toBe('1')

    await browser.eval(() => {
      const input = document.getElementById('input')!
      ;(window as any).__input = input
      ;(window as any).__fallbackSeen = false
      new MutationObserver(() => {
        if (document.getElementById('fallback')) {
          ;(window as any).__fallbackSeen = true
        }
      }).observe(document.body, { childList: true, subtree: true })
    })

    await browser.elementByCss('#input').type('abc')

    await retry(async () => {
      expect(await browser.elementByCss('#q').text()).toBe('abc')
    })
    expect(await browser.eval(() => (window as any).__fallbackSeen)).toBe(false)
    expect(
      await browser.eval(
        () => document.getElementById('input') === (window as any).__input
      )
    ).toBe(true)
    expect(await browser.eval(() => document.activeElement?.id)).toBe('input')
    expect(await browser.elementByCss('#input').getValue()).toBe('abc')
  })
})
