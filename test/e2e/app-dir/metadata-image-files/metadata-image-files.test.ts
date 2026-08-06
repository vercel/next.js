import { nextTestSetup } from 'e2e-utils'

describe('app dir - metadata image files', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle imported metadata images', async () => {
    const browser = await next.browser('/')
    const images = await browser.elementsByCss('img')
    expect(images.length).toBe(5)

    for (const image of images) {
      const src = await image.getAttribute('src')
      expect(src).not.toContain('undefined')
    }
  })
})
