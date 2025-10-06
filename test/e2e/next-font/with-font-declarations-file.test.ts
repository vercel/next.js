import cheerio from 'cheerio'
import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import { join } from 'path'

const mockedGoogleFontResponses = require.resolve(
  './google-font-mocked-responses.js'
)

const isDev = (global as any).isNextDev

describe('next/font/google with-font-declarations-file', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: join(__dirname, 'with-font-declarations-file'),
      env: {
        NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedGoogleFontResponses,
      },
    })
  })
  afterAll(() => next.destroy())

  test('preload correct files at /inter', async () => {
    const html = await renderViaHTTP(next.url, '/inter')
    const $ = cheerio.load(html)

    // Preconnect
    expect($('link[rel="preconnect"]').length).toBe(0)

    if (isDev) {
      // In dev all fonts will be preloaded since it's before DCE
      expect($('link[as="font"]').length).toBe(4)
    } else {
      // Preload
      expect($('link[as="font"]').length).toBe(
        // TODO: Remove this once tree shaking PACK-4656
        process.env.IS_TURBOPACK_TEST ? 4 : 2
      )
      // From /_app
      expect($('link[as="font"]').get(0).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: expect.stringMatching(
          /\/_next\/static\/media\/.*-s\.p(\..*)?\.woff2/
        ),
        rel: 'preload',
        type: 'font/woff2',
        'data-next-font': 'size-adjust',
      })
      // From /inter
      expect($('link[as="font"]').get(1).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: expect.stringMatching(
          /\/_next\/static\/media\/.*-s\.p(\..*)?\.woff2/
        ),
        rel: 'preload',
        type: 'font/woff2',
        'data-next-font': 'size-adjust',
      })
    }
  })

  test('preload correct files at /roboto', async () => {
    const html = await renderViaHTTP(next.url, '/roboto')
    const $ = cheerio.load(html)

    // Preconnect
    expect($('link[rel="preconnect"]').length).toBe(0)

    if (isDev) {
      // In dev all fonts will be preloaded since it's before DCE
      expect($('link[as="font"]').length).toBe(4)
    } else {
      // Preload
      expect($('link[as="font"]').length).toBe(
        // TODO: Remove this once tree shaking PACK-4656
        process.env.IS_TURBOPACK_TEST ? 4 : 2
      )
      // From /_app
      expect($('link[as="font"]').get(0).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: expect.stringMatching(
          /\/_next\/static\/media\/.*-s\.p(\..*)?\.woff2/
        ),
        rel: 'preload',
        type: 'font/woff2',
        'data-next-font': 'size-adjust',
      })
      // From /roboto
      expect($('link[as="font"]').get(1).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: expect.stringMatching(
          /\/_next\/static\/media\/.*-s\.p(\..*)?\.woff2/
        ),
        rel: 'preload',
        type: 'font/woff2',
        'data-next-font': 'size-adjust',
      })
    }
  })

  test('preload correct files at /local-font', async () => {
    const html = await renderViaHTTP(next.url, '/local-font')
    const $ = cheerio.load(html)

    // Preconnect
    expect($('link[rel="preconnect"]').length).toBe(0)

    if (isDev) {
      // In dev all fonts will be preloaded since it's before DCE
      expect($('link[as="font"]').length).toBe(4)
    } else {
      // Preload
      expect($('link[as="font"]').length).toBe(
        // TODO: Remove this once tree shaking PACK-4656
        process.env.IS_TURBOPACK_TEST ? 4 : 2
      )
      // From /_app
      expect($('link[as="font"]').get(0).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: expect.stringMatching(
          /\/_next\/static\/media\/.*-s\.p(\..*)?\.woff2/
        ),
        rel: 'preload',
        type: 'font/woff2',
        'data-next-font': 'size-adjust',
      })
      // From /local-font
      expect($('link[as="font"]').get(1).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: expect.stringMatching(
          /\/_next\/static\/media\/.*-s\.p(\..*)?\.woff2/
        ),
        rel: 'preload',
        type: 'font/woff2',
        'data-next-font': 'size-adjust',
      })
    }
  })
})
