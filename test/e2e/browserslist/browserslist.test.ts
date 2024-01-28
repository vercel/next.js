import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP, fetchViaHTTP } from 'next-test-utils'
import path from 'path'
import cheerio from 'cheerio'
const appDir = path.join(__dirname, 'app')

// TODO: Implement Browserslist support in Turbopack
;(process.env.TURBOPACK ? describe.skip : describe)('Browserslist', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(appDir, 'pages')),
        // In Chrome 45 arrow functions are introduced, by
        '.browserslistrc': 'Chrome 42',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should apply browserslist target', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)

    expect(
      (
        await Promise.all(
          $('script')
            .toArray()
            .map(async (el) => {
              const src = $(el).attr('src')
              const res = await fetchViaHTTP(next.url, src)
              const code = await res.text()
              if (code.includes('()=>')) {
                return src
              }
              return false
            })
        )
      ) // Filter out false values
        .filter((item) => item)
    ).toBeEmpty()
  })
})
