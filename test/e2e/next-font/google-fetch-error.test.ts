import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'
import webdriver from 'next-webdriver'

const mockedGoogleFontResponses = require.resolve(
  './google-font-mocked-responses.js'
)

describe('next/font/google fetch error', () => {
  const isDev = (global as any).isNextDev
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'google-fetch-error/pages')),
      },
      env: {
        NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedGoogleFontResponses,
      },
      skipStart: true,
    })
  })
  afterAll(() => next.destroy())

  if (isDev) {
    it('should use a fallback font in dev', async () => {
      await next.start()
      const outputIndex = next.cliOutput.length
      const browser = await webdriver(next.url, '/')

      const ascentOverride = await browser.eval(
        'Array.from(document.fonts.values()).find(font => font.family.includes("Inter_Fallback")).ascentOverride'
      )
      expect(ascentOverride).toBe('90%')

      const descentOverride = await browser.eval(
        'Array.from(document.fonts.values()).find(font => font.family.includes("Inter_Fallback")).descentOverride'
      )
      expect(descentOverride).toBe('22.43%')

      const lineGapOverride = await browser.eval(
        'Array.from(document.fonts.values()).find(font => font.family.includes("Inter_Fallback")).lineGapOverride'
      )
      expect(lineGapOverride).toBe('0%')

      const sizeAdjust = await browser.eval(
        'Array.from(document.fonts.values()).find(font => font.family.includes("Inter_Fallback")).sizeAdjust'
      )
      expect(sizeAdjust).toBe('107.64%')

      expect(next.cliOutput.slice(outputIndex)).toInclude(
        'Failed to download `Inter` from Google Fonts. Using fallback font instead.'
      )
    })
  } else {
    it('should error when not in dev', async () => {
      await expect(next.start()).rejects.toThrow('next build failed')
      expect(next.cliOutput).toInclude(
        'Failed to fetch `Inter` from Google Fonts.'
      )
    })
  }
})
