import { nextTestSetup } from 'e2e-utils'
import { getDevIndicatorPosition } from './utils'

describe('devtools-position-bottom-right', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      devIndicators: {
        position: 'bottom-right',
      },
    },
  })

  it('should devtools indicator position initially be bottom-right when configured', async () => {
    const browser = await next.browser('/')
    const style = await getDevIndicatorPosition(browser)
    expect(style).toContain('bottom: 20px')
    expect(style).toContain('right: 20px')
  })
})
