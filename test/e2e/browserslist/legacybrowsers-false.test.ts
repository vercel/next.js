import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import path from 'path'
import cheerio from 'cheerio'
import fetch from 'node-fetch'
const appDir = path.join(__dirname, 'app')

describe('legacyBrowsers: false', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(appDir, 'pages')),
        'next.config.js': `
          module.exports = {
            experimental: {
              legacyBrowsers: false
            }
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should apply legacyBrowsers: true by default', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)

    let finished = false
    await Promise.all(
      $('script')
        .toArray()
        .map(async (el) => {
          const src = $(el).attr('src')
          if (!src) return
          if (src.includes('index-')) {
            const source = next.url + src
            const code = await fetch(source).then((res) => res.text())

            expect(code.includes('async()=>{console.log(')).toBe(true)
            finished = true
          }
        })
    )
    expect(finished).toBe(true)
  })
})
