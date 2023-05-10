import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import { join } from 'path'

const mockedGoogleFontResponses = require.resolve(
  './google-font-mocked-responses.js'
)

describe('next/font/google without-preloaded-fonts without _app', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/no-preload.js': new FileRef(
          join(__dirname, 'without-preloaded-fonts/pages/no-preload.js')
        ),
        'pages/without-fonts.js': new FileRef(
          join(__dirname, 'without-preloaded-fonts/pages/without-fonts.js')
        ),
      },
      env: {
        NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedGoogleFontResponses,
      },
    })
  })
  afterAll(() => next.destroy())

  test('without preload', async () => {
    const html = await renderViaHTTP(next.url, '/no-preload')
    const $ = cheerio.load(html)

    // Preconnect
    expect($('link[rel="preconnect"]').length).toBe(1)
    expect($('link[rel="preconnect"]').get(0).attribs).toEqual({
      crossorigin: 'anonymous',
      href: '/',
      rel: 'preconnect',
      'data-next-font': 'size-adjust',
    })

    // Preload
    expect($('link[as="font"]').length).toBe(0)
  })

  test('without fonts', async () => {
    const html = await renderViaHTTP(next.url, '/without-fonts')
    const $ = cheerio.load(html)

    expect($('link[rel="preconnect"]').length).toBe(0)
    expect($('link[as="font"]').length).toBe(0)
  })
})

describe('next/font/google no preloads with _app', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/_app.js': new FileRef(
          join(__dirname, 'without-preloaded-fonts/pages/_app.js')
        ),
        'pages/no-preload.js': new FileRef(
          join(__dirname, 'without-preloaded-fonts/pages/no-preload.js')
        ),
        'pages/without-fonts.js': new FileRef(
          join(__dirname, 'without-preloaded-fonts/pages/without-fonts.js')
        ),
      },
      env: {
        NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedGoogleFontResponses,
      },
    })
  })
  afterAll(() => next.destroy())

  test('without preload', async () => {
    const html = await renderViaHTTP(next.url, '/no-preload')
    const $ = cheerio.load(html)

    // Preconnect
    expect($('link[rel="preconnect"]').length).toBe(1)
    expect($('link[rel="preconnect"]').get(0).attribs).toEqual({
      crossorigin: 'anonymous',
      href: '/',
      rel: 'preconnect',
      'data-next-font': 'size-adjust',
    })

    // Preload
    expect($('link[as="font"]').length).toBe(0)
  })

  test('without fonts', async () => {
    const html = await renderViaHTTP(next.url, '/without-fonts')
    const $ = cheerio.load(html)

    // Preconnect
    expect($('link[rel="preconnect"]').length).toBe(1)
    expect($('link[rel="preconnect"]').get(0).attribs).toEqual({
      crossorigin: 'anonymous',
      href: '/',
      rel: 'preconnect',
      'data-next-font': 'size-adjust',
    })

    // Preload
    expect($('link[as="font"]').length).toBe(0)
  })
})
