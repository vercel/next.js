import { join } from 'path'
import cheerio from 'cheerio'
import { FileRef, nextTestSetup, type NextInstance } from 'e2e-utils'

const fonts = join(__dirname, '../../next-font/fonts')

function fontFile(name: string) {
  return { [`fonts/${name}`]: new FileRef(join(fonts, name)) }
}

async function fontPreloads(next: NextInstance, pathname: string) {
  const res = await next.fetch(pathname)
  const $ = cheerio.load(await res.text())
  const inHtml = $('link[rel="preload"][as="font"]')
    .map((_, link) => $(link).attr('href'))
    .get()
  const inHeader = (res.headers.get('link') ?? '')
    .split(', ')
    .filter((link) => /rel="?preload/.test(link) && /as="?font/.test(link))
    .map((link) => link.match(/<([^>]+)>/)![1])
  return { $, fonts: new Set([...inHtml, ...inHeader]) }
}

describe('app dir - not-found - font-preload', () => {
  describe('with a not-found file', () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, 'custom-not-found/app')),
        ...fontFile('font1_roboto.woff2'),
        ...fontFile('font3_inter-regular.woff2'),
      },
    })

    it('should preload the fonts of the root layout and the not-found file on the 404', async () => {
      const { $, fonts } = await fontPreloads(next, '/does-not-exist')
      expect($('#not-found').text()).toBe('Not found')
      expect(fonts.size).toBe(2)
    })
  })

  describe('with the default not-found', () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, 'default-not-found/app')),
        ...fontFile('font1_roboto.woff2'),
      },
    })

    it('should preload the font of the root layout on the 404', async () => {
      const { $, fonts } = await fontPreloads(next, '/does-not-exist')
      expect($('h2').text()).toBe('This page could not be found.')
      expect(fonts.size).toBe(1)
    })
  })
})
