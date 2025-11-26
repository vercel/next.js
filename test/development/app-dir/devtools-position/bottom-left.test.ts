import { nextTestSetup } from 'e2e-utils'
import { getDevIndicatorPosition } from './utils'

describe('devtools-position-bottom-left', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      devIndicators: {
        position: 'bottom-left',
      },
    },
  })

  it('should devtools indicator position initially be bottom-left when configured', async () => {
    const browser = await next.browser('/')
    const style = await getDevIndicatorPosition(browser)
    expect(style).toContain('bottom: 20px')
    expect(style).toContain('left: 20px')
  })
})
