import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import { join } from 'path'

const mockedGoogleFontResponses = require.resolve(
  './google-font-mocked-responses.js'
)

describe('next/font/google custom-page-extensions', () => {
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: join(__dirname, 'custom-page-extensions'),
    env: {
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedGoogleFontResponses,
    },
  })

  test('preload correct files at /', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)

    // Preload should exist and point to the font file
    expect($('link[as="font"]').length).toBe(1)
    expect($('link[as="font"]').get(0).attribs).toEqual({
      as: 'font',
      crossorigin: '',
      href: expect.stringMatching(
        /\/_next\/static\/(immutable\/)?media\/.*-s\.p(\..*)?\.woff2/
      ),
      rel: 'preload',
      type: 'font/woff2',
    })
  })
})
