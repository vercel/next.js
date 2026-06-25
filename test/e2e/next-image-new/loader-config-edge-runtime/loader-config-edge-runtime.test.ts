import { nextTestSetup } from 'e2e-utils'

describe('Image Loader Config with Edge Runtime', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should add "src" to img1 based on the loader config', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementById('img1').getAttribute('src')).toBe(
      '/logo.png#w:828,q:50'
    )
  })

  it('should add "srcset" to img1 based on the loader config', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementById('img1').getAttribute('srcset')).toBe(
      '/logo.png#w:640,q:50 1x, /logo.png#w:828,q:50 2x'
    )
  })

  it('should add "src" to img2 based on the loader prop', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementById('img2').getAttribute('src')).toBe(
      '/logo.png?wid=640&qual=35'
    )
  })

  it('should add "srcset" to img2 based on the loader prop', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementById('img2').getAttribute('srcset')).toBe(
      '/logo.png?wid=256&qual=35 1x, /logo.png?wid=640&qual=35 2x'
    )
  })
})
