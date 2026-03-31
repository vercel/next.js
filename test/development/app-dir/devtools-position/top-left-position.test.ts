import { nextTestSetup } from 'e2e-utils'
import { getDevIndicatorPosition } from './utils'

describe('devtools-position-top-left', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      devIndicators: {
        position: 'top-left',
      },
    },
  })

  it('should devtools indicator position initially be top-left when configured', async () => {
    const browser = await next.browser('/')
    const style = await getDevIndicatorPosition(browser)
    expect(style).toContain('top: 20px')
    expect(style).toContain('left: 20px')
  })
})
