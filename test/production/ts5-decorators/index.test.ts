import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('TypeScript 5 stage-3 decorators', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'app'),
  })

  it('should build and render a page using TS5 decorators', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('#result').text()
    expect(text).toBe('Hello, world!')
  })
})
