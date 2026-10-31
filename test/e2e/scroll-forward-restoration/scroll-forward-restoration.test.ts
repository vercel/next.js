import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Scroll Forward Restoration Support', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should restore the scroll position on navigating forward', async () => {
    const browser = await next.browser('/another')
    await browser.elementByCss('#to-index').click()

    await retry(async () => {
      const html = await browser.eval(() => document.documentElement.innerHTML)
      expect(html).toContain('the end')
    })

    await browser.eval(() =>
      document.querySelector('#to-another')!.scrollIntoView()
    )
    const scrollRestoration = await browser.eval(
      () => window.history.scrollRestoration
    )

    expect(scrollRestoration).toBe('manual')

    const scrollX = Math.floor(await browser.eval(() => window.scrollX))
    const scrollY = Math.floor(await browser.eval(() => window.scrollY))

    expect(scrollX).not.toBe(0)
    expect(scrollY).not.toBe(0)

    await browser.eval(() => window.history.back())

    await retry(async () => {
      const html = await browser.eval(() => document.documentElement.innerHTML)
      expect(html).toContain('hi from another')
    })

    await browser.eval(() => ((window as any).didHydrate = false))
    await browser.eval(() => window.history.forward())

    await retry(async () => {
      expect(await browser.eval(() => (window as any).didHydrate)).toBe(true)
    })

    const newScrollX = Math.floor(await browser.eval(() => window.scrollX))
    const newScrollY = Math.floor(await browser.eval(() => window.scrollY))

    expect(scrollX).toBe(newScrollX)
    expect(scrollY).toBe(newScrollY)
  })
})
