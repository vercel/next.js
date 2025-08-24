import { nextTestSetup } from 'e2e-utils'

describe('Script component with crossOrigin props', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should be set crossOrigin also in preload link tag', async () => {
    const browser = await next.browser('/')

    const crossorigin = await browser
      .elementByCss('link[href="https://code.jquery.com/jquery-3.7.1.min.js"]')
      .getAttribute('crossorigin')

    expect(crossorigin).toBe('use-credentials')
  })
})
