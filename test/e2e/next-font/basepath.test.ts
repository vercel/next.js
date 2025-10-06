import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import { join } from 'path'

const mockedGoogleFontResponses = require.resolve(
  './google-font-mocked-responses.js'
)

describe('next/font/google basepath', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'basepath/pages')),
        'next.config.js': new FileRef(
          join(__dirname, 'basepath/next.config.js')
        ),
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
    expect($('link[as="font"]').get(0).attribs).toEqual(
      expect.objectContaining({
        as: 'font',
        crossorigin: 'anonymous',
        href: expect.stringMatching(
          /\/dashboard\/_next\/static\/media\/.*.p.*.woff2/
        ),
        rel: 'preload',
        type: 'font/woff2',
        'data-next-font': 'size-adjust',
      })
    )
  })
})
