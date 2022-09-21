import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import { join } from 'path'

const mockedGoogleFontResponses = require.resolve(
  './google-font-mocked-responses.js'
)

describe('@next/font/google basepath', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'basepath/pages')),
        'next.config.js': new FileRef(
          join(__dirname, 'basepath/next.config.js')
        ),
      },
      dependencies: {
        '@next/font': '*',
      },
      env: {
        NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedGoogleFontResponses,
      },
    })
  })
  afterAll(() => next.destroy())

  test('preload correct files', async () => {
    const html = await renderViaHTTP(next.url, '/dashboard')
    const $ = cheerio.load(html)

    // Preconnect
    expect($('link[rel="preconnect"]').length).toBe(0)

    // Preload
    expect($('link[as="font"]').length).toBe(1)
    expect($('link[as="font"]').get(0).attribs).toEqual({
      as: 'font',
      crossorigin: 'anonymous',
      href: '/dashboard/_next/static/fonts/0812efcfaefec5ea.p.woff2',
      rel: 'preload',
      type: 'font/woff2',
    })
  })
})
