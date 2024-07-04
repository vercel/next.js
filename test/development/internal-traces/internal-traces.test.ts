import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('internal traces', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname)),
  })

  it('should not write long internal traces to stdio', async () => {
    const browser = await next.browser('/')
    const crossOrigin = await browser
      .elementByCss('link[href="https://code.jquery.com/jquery-3.7.1.min.js"]')
      .getAttribute('crossorigin')

    expect(crossOrigin).toBe('use-credentials')
  })
})
