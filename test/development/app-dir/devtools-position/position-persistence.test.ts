import { nextTestSetup } from 'e2e-utils'
import { getDevIndicatorPosition } from './utils'

describe('devtools-position-persistence', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      devIndicators: {
        position: 'top-right',
      },
    },
  })

  it('should maintain devtools indicator position after navigation', async () => {
    const browser = await next.browser('/')

    let style = await getDevIndicatorPosition(browser)

    expect(style).toContain('top: 20px')
    expect(style).toContain('right: 20px')

    // Navigate and check devtools indicator position is maintained
    await browser.refresh()
    await browser.waitForIdleNetwork()

    style = await getDevIndicatorPosition(browser)

    expect(style).toContain('top: 20px')
    expect(style).toContain('right: 20px')
  })
})
