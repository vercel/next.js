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
})
