import { nextTestSetup } from 'e2e-utils'

describe('Image Loader Config with Default Loader and File', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('component', () => {
    it('should work with loaderFile config, leaving default image optimization enabled', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementById('img1').getAttribute('src')).toBe(
        '/_next/image/?url=/logo.png&w=828&q=50'
      )
      expect(await browser.elementById('img1').getAttribute('srcset')).toBe(
        '/_next/image/?url=/logo.png&w=640&q=50 1x, /_next/image/?url=/logo.png&w=828&q=50 2x'
      )

      expect(
        await browser.eval(
          `document.getElementById('img1').complete && document.getElementById('img1').naturalWidth !== 0`
        )
      ).toBe(true)
    })

    it('should work with loader prop', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementById('img2').getAttribute('src')).toBe(
        '/logo.png?wid=640&qual=35'
      )
      expect(await browser.elementById('img2').getAttribute('srcset')).toBe(
        '/logo.png?wid=256&qual=35 1x, /logo.png?wid=640&qual=35 2x'
      )
    })
  })

  describe('getImageProps', () => {
    it('should work with loaderFile config, leaving default image optimization enabled', async () => {
      const browser = await next.browser('/get-img-props')
      expect(await browser.elementById('img1').getAttribute('src')).toBe(
        '/_next/image/?url=/logo.png&w=828&q=50'
      )
      expect(await browser.elementById('img1').getAttribute('srcset')).toBe(
        '/_next/image/?url=/logo.png&w=640&q=50 1x, /_next/image/?url=/logo.png&w=828&q=50 2x'
      )

      expect(
        await browser.eval(
          `document.getElementById('img1').complete && document.getElementById('img1').naturalWidth !== 0`
        )
      ).toBe(true)
    })

    it('should work with loader prop', async () => {
      const browser = await next.browser('/get-img-props')
      expect(await browser.elementById('img2').getAttribute('src')).toBe(
        '/logo.png?wid=640&qual=35'
      )
      expect(await browser.elementById('img2').getAttribute('srcset')).toBe(
        '/logo.png?wid=256&qual=35 1x, /logo.png?wid=640&qual=35 2x'
      )
    })
  })
})
