import type { AdjustFontFallback, FontLoader } from 'next/font'
// @ts-ignore
import { calculateSizeAdjustValues } from 'next/dist/server/font-utils'
// @ts-ignore
import * as Log from 'next/dist/build/output/log'
// @ts-ignore
import chalk from 'next/dist/compiled/chalk'
// @ts-ignore
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
  isServer,
}) => {
  const subsets = config?.subsets || []

  const {
    fontFamily,
    weights,
    styles,
    display,
    preload,
    selectedVariableAxes,
    fallback,
    adjustFontFallback,
    variable,
    subsets: callSubsets,
  } = validateData(functionName, data)

  if (isServer && preload && !callSubsets && !config?.subsets) {
    Log.warn(
      `The ${chalk.bold('@next/font/google')} font ${chalk.bold(
        fontFamily
      )} has no selected subsets. Please specify subsets in the function call or in your ${chalk.bold(
        'next.config.js'
      )}, otherwise no fonts will be preloaded. Read more: https://nextjs.org/docs/messages/google-fonts-missing-subsets`
    )
  }

  let fontFaceDeclarations = ''
  for (const weight of weights) {
    for (const style of styles) {
      const fontAxes = getFontAxes(
        fontFamily,
        weight,
        style,
        selectedVariableAxes
      )
      const url = getUrl(fontFamily, fontAxes, display)

      let cachedCssRequest = cssCache.get(url)
      const fontFaceDeclaration =
        cachedCssRequest ?? (await fetchCSSFromGoogleFonts(url, fontFamily))
      if (!cachedCssRequest) {
        cssCache.set(url, fontFaceDeclaration)
      } else {
        cssCache.delete(url)
      }
      fontFaceDeclarations += `${fontFaceDeclaration}\n`
    }
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
          preloadFontFile:
            !!preload && (callSubsets ?? subsets).includes(currentSubset),
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
      Log.error(
        `Failed to find font override values for font \`${fontFamily}\``
      )
    }
  }

  return {
    css: updatedCssResponse,
    fallbackFonts: fallback,
    weight:
      weights.length === 1 && weights[0] !== 'variable'
        ? weights[0]
        : undefined,
    style: styles.length === 1 ? styles[0] : undefined,
    variable,
    adjustFontFallback: adjustFontFallbackMetrics,
  }
}

export default downloadGoogleFonts
