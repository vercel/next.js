import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP, fetchViaHTTP } from 'next-test-utils'
import path from 'path'
import cheerio from 'cheerio'
const appDir = path.join(__dirname, 'app')

describe('Browserslist', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(appDir, 'pages')),
        '.browserslistrc': 'Chrome 73',
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should apply browserslist target', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)

    let finished = false
    await Promise.all(
      $('script')
        .toArray()
        .map(async (el) => {
          const src = $(el).attr('src')
          if (!src) return
          if (src.includes('/index')) {
            const res = await fetchViaHTTP(next.url, src)
            const code = await res.text()
            expect(code).toMatch('()=>')
            finished = true
          }
        })
    )
    expect(finished).toBe(true)
  })
})
