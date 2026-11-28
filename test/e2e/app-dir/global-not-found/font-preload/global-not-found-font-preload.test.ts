import { join } from 'path'
import cheerio from 'cheerio'
import { FileRef, nextTestSetup, type NextInstance } from 'e2e-utils'

const fonts = join(__dirname, '../../next-font/fonts')

function fixture(name: string) {
  return {
    app: new FileRef(join(__dirname, name, 'app')),
    'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
    'fonts/font1_roboto.woff2': new FileRef(join(fonts, 'font1_roboto.woff2')),
    'fonts/font3_inter-regular.woff2': new FileRef(
      join(fonts, 'font3_inter-regular.woff2')
    ),
  }
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

describe('global-not-found - font-preload', () => {
  describe('with a global-not-found file', () => {
    const { next } = nextTestSetup({
      files: fixture('custom-global-not-found'),
    })

    it('should preload exactly one font on the 404', async () => {
      const { $, fonts } = await fontPreloads(next, '/does-not-exist')
      expect($('#global-not-found').text()).toBe('Not found')
      expect(fonts.size).toBe(1)
    })
  })

  describe('with the default global-not-found', () => {
    const { next } = nextTestSetup({
      files: fixture('default-global-not-found'),
    })

    it('should not preload the fonts of the root layout and not-found file on the 404', async () => {
      const { $, fonts } = await fontPreloads(next, '/does-not-exist')
      expect($('h2').text()).toBe('This page could not be found.')
      expect(fonts.size).toBe(0)
    })
  })
})
