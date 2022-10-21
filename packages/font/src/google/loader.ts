import type { AdjustFontFallback, FontLoader } from 'next/font'
// @ts-ignore
import { calculateSizeAdjustValues } from 'next/dist/server/font-utils'
import {
  fetchCSSFromGoogleFonts,
  fetchFontFile,
  getFontAxes,
  getUrl,
  validateData,
} from './utils'

const cssCache = new Map<string, Promise<string>>()
const fontCache = new Map<string, any>()

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
    variable,
  } = validateData(functionName, data)
  const fontAxes = getFontAxes(fontFamily, weight, style, selectedVariableAxes)
  const url = getUrl(fontFamily, fontAxes, display)

  let cachedCssRequest = cssCache.get(url)
  const fontFaceDeclarations =
    cachedCssRequest ?? (await fetchCSSFromGoogleFonts(url, fontFamily))
  if (!cachedCssRequest) {
    cssCache.set(url, fontFaceDeclarations)
  } else {
    cssCache.delete(url)
  }

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
      let cachedFontRequest = fontCache.get(googleFontFileUrl)
      const fontFileBuffer =
        cachedFontRequest ?? (await fetchFontFile(googleFontFileUrl))
      if (!cachedFontRequest) {
        fontCache.set(googleFontFileUrl, fontFileBuffer)
      } else {
        fontCache.delete(googleFontFileUrl)
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
      const { ascent, descent, lineGap, fallbackFont, sizeAdjust } =
        calculateSizeAdjustValues(
          require('next/dist/server/google-font-metrics.json')[fontFamily]
        )
      adjustFontFallbackMetrics = {
        fallbackFont,
        ascentOverride: `${ascent}%`,
        descentOverride: `${descent}%`,
        lineGapOverride: `${lineGap}%`,
        sizeAdjust: `${sizeAdjust}%`,
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
    variable,
    adjustFontFallback: adjustFontFallbackMetrics,
  }
}

export default downloadGoogleFonts
