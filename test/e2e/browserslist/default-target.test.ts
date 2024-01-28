import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP, fetchViaHTTP } from 'next-test-utils'
import path from 'path'
import cheerio from 'cheerio'
const appDir = path.join(__dirname, 'app')

describe('default browserslist target', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(appDir, 'pages')),
      },
    })
  })
  afterAll(() => next.destroy())

  it('should apply default browserslist target', async () => {
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
              // Default compiles for ES Modules output
              if (code.includes('()=>')) {
                return src
              }
              return false
            })
        )
      )
        // Filter out false values
        .filter((item) => item)
    ).not.toBeEmpty()
  })
})
