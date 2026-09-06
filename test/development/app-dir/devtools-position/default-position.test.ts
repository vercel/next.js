import { nextTestSetup } from 'e2e-utils'
import { getDevIndicatorPosition } from './utils'

describe('devtools-position-default', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should devtools indicator position initially be bottom-left by default', async () => {
    const browser = await next.browser('/')
    const style = await getDevIndicatorPosition(browser)
    expect(style).toContain('bottom: 20px')
    expect(style).toContain('left: 20px')
  })

  it('should disable browser touch gestures on the draggable indicator', async () => {
    const browser = await next.browser('/')
    await getDevIndicatorPosition(browser)

    const touchAction = await browser.eval(() => {
      const portal = Array.from(
        document.querySelectorAll('nextjs-portal')
      ).find((p) => p.shadowRoot?.querySelector('[data-nextjs-toast]'))
      const indicator = portal?.shadowRoot?.querySelector('[data-nextjs-toast]')
      const draggable = indicator?.firstElementChild

      return draggable ? getComputedStyle(draggable).touchAction : null
    })

    expect(touchAction).toBe('none')
  })
})
