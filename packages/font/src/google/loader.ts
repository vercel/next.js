import type { AdjustFontFallback, FontLoader } from 'next/font'
// @ts-ignore
import fetch from 'next/dist/compiled/node-fetch'
// @ts-ignore
import { calculateOverrideValues } from 'next/dist/server/font-utils'
import {
  fetchCSSFromGoogleFonts,
  getFontAxes,
  getUrl,
  validateData,
} from './utils'

const downloadGoogleFonts: FontLoader = async ({
  functionName,
  data,
  config,
  emitFontFile,
}) => {
  if (!config?.subsets) {
    throw new Error(
      'Please specify subsets for `@next/font/google` in your `next.config.js`'
    )
  }

  const {
    fontFamily,
    weight,
    style,
    display,
    preload,
    selectedVariableAxes,
    fallback,
    adjustFontFallback,
  } = validateData(functionName, data)
  const fontAxes = getFontAxes(fontFamily, weight, style, selectedVariableAxes)
  const url = getUrl(fontFamily, fontAxes, display)

  const fontFaceDeclarations = await fetchCSSFromGoogleFonts(url, fontFamily)

  // Find font files to download
  const fontFiles: Array<{
    googleFontFileUrl: string
    preloadFontFile: boolean
  }> = []
  let currentSubset = ''
  for (const line of fontFaceDeclarations.split('\n')) {
    // Each @font-face has the subset above it in a comment
    const newSubset = /\/\* (.+?) \*\//.exec(line)?.[1]
    if (newSubset) {
      currentSubset = newSubset
    } else {
      const googleFontFileUrl = /src: url\((.+?)\)/.exec(line)?.[1]
      if (googleFontFileUrl) {
        fontFiles.push({
          googleFontFileUrl,
          preloadFontFile: !!preload && config.subsets.includes(currentSubset),
        })
      }
    }
  }

  // Download font files
  const downloadedFiles = await Promise.all(
    fontFiles.map(async ({ googleFontFileUrl, preloadFontFile }) => {
      let fontFileBuffer: Buffer
      if (process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES) {
        fontFileBuffer = Buffer.from(googleFontFileUrl)
      } else {
        const arrayBuffer = await fetch(googleFontFileUrl).then((r: any) =>
          r.arrayBuffer()
        )
        fontFileBuffer = Buffer.from(arrayBuffer)
      }

      const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)![1]
      // Emit font file to .next/static/fonts
      const selfHostedFileUrl = emitFontFile(
        fontFileBuffer,
        ext,
        preloadFontFile
      )

      return {
        googleFontFileUrl,
        selfHostedFileUrl,
      }
    })
  )

  // Replace @font-face sources with self-hosted files
  let updatedCssResponse = fontFaceDeclarations
  for (const { googleFontFileUrl, selfHostedFileUrl } of downloadedFiles) {
    updatedCssResponse = updatedCssResponse.replace(
      googleFontFileUrl,
      selfHostedFileUrl
    )
  }

  // Add fallback font
  let adjustFontFallbackMetrics: AdjustFontFallback | undefined
  if (adjustFontFallback) {
    try {
      const { ascent, descent, lineGap, fallbackFont } =
        calculateOverrideValues(
          fontFamily,
          require('next/dist/server/google-font-metrics.json')
        )
      adjustFontFallbackMetrics = {
        fallbackFont,
        ascentOverride: ascent,
        descentOverride: descent,
        lineGapOverride: lineGap,
      }
    } catch {
      console.error(
        `Failed to find font override values for font \`${fontFamily}\``
      )
    }
  }

  return {
    css: updatedCssResponse,
    fallbackFonts: fallback,
    weight: weight === 'variable' ? undefined : weight,
    style,
    variable: `--next-font-${fontFamily.toLowerCase().replace(/ /g, '-')}${
      weight !== 'variable' ? `-${weight}` : ''
    }${style === 'italic' ? `-italic` : ''}`,
    adjustFontFallback: adjustFontFallbackMetrics,
  }
}

export default downloadGoogleFonts
