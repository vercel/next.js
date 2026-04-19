import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('css-modules-scoping', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not prefix grid areas', async () => {
    const browser = await next.browser('/grid')

    // Check grid-area of header
    await retry(async () => {
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#header')).gridArea`
        )
      ).toBe('header')
    })

    // Check grid-area of sidebar
    await retry(async () => {
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#sidebar')).gridArea`
        )
      ).toBe('sidebar')
    })

    // Check grid-area of main
    await retry(async () => {
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#main')).gridArea`
        )
      ).toBe('main')
    })

    // Check grid-area of footer
    await retry(async () => {
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#footer')).gridArea`
        )
      ).toBe('footer')
    })
  })

  it('should prefix animation', async () => {
    const browser = await next.browser('/animation')

    // Check animation-name
    await retry(async () => {
      const animationName = await browser.eval(
        `window.getComputedStyle(document.querySelector('#animated')).animationName`
      )
      // Check if the animation name is not `example` exactly. If it's exactly `example` then it's not scoped.
      expect(animationName).not.toBe('example')
      // Check if the animation name has `example` anywhere in it
      expect(animationName).toContain('example')
    })
  })
})
