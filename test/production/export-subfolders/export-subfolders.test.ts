import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

describe('Export config#exportTrailingSlash set to false', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.build()
  })

  it('should export pages as [filename].html instead of [filename]/index.html', async () => {
    expect(await next.hasFile('out/index.html')).toBe(true)
    expect(await next.hasFile('out/about.html')).toBe(true)
    expect(await next.hasFile('out/posts.html')).toBe(true)
    expect(await next.hasFile('out/posts/single.html')).toBe(true)

    const html = await next.readFile('out/index.html')
    const $ = cheerio.load(html)
    expect($('p').text()).toBe('I am a home page')

    const htmlSingle = await next.readFile('out/posts/single.html')
    const $single = cheerio.load(htmlSingle)
    expect($single('p').text()).toBe('I am a single post')
  })
})
