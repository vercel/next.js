import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-dir Image Component from node_modules', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should apply image config for node_modules', async () => {
    const browser = await next.browser('/')
    const src = await browser
      .elementById('image-from-node-modules')
      .getAttribute('src')
    expect(src).toMatch('i.imgur.com')

    const srcset = await browser
      .elementById('image-from-node-modules')
      .getAttribute('srcset')
    expect(srcset).toMatch('1234')
  })

  describe('static image import', () => {
    async function expectServedImage(src: string) {
      const res = await next.fetch(src)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/^image\//)
    }

    it('should import an image from node_modules as StaticImageData in a server component', async () => {
      const $ = await next.render$('/static-import')

      const dependency = JSON.parse($('#server-dependency').text())
      expect(dependency).toEqual({
        type: 'object',
        src: expect.stringMatching(/marker.*\.png$/),
        width: 400,
        height: 400,
      })
      expect($('#server-dependency-src').text()).toBe(dependency.src)
      await expectServedImage(dependency.src)

      expect($('#server-dependency-image').attr('width')).toBe('400')
      expect($('#server-dependency-image').attr('height')).toBe('400')
    })

    it('should import a project image as StaticImageData in a server component', async () => {
      const $ = await next.render$('/static-import/local')

      const local = JSON.parse($('#server-local').text())
      expect(local).toEqual({
        type: 'object',
        src: expect.stringMatching(/local.*\.png$/),
        width: 160,
        height: 394,
      })
      await expectServedImage(local.src)

      expect($('#server-local-image').attr('width')).toBe('160')
      expect($('#server-local-image').attr('height')).toBe('394')
    })

    it('should import an image from node_modules as StaticImageData in a client component', async () => {
      const browser = await next.browser('/static-import')

      let dependency
      await retry(async () => {
        dependency = JSON.parse(
          await browser.elementByCss('#client-dependency').text()
        )
        expect(dependency).toEqual({
          type: 'object',
          src: expect.stringMatching(/marker.*\.png$/),
          width: 400,
          height: 400,
        })
      })
      await expectServedImage(dependency.src)

      const image = await browser.elementById('client-dependency-image')
      expect(await image.getAttribute('width')).toBe('400')
      expect(await image.getAttribute('height')).toBe('400')
    })
  })
})
