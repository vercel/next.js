import type { AdjustFontFallback, FontLoader } from 'next/font'
// @ts-ignore
import * as Log from 'next/dist/build/output/log'
// @ts-ignore
import chalk from 'next/dist/compiled/chalk'
// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
import fontFromBuffer from '@next/font/dist/fontkit'
import {
  fetchCSSFromGoogleFonts,
  fetchFontFile,
  getFontAxes,
  getUrl,
  validateData,
} from './utils'
import { calculateFallbackFontValues } from '../utils'

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
    weight,
    style,
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
    isLatin: boolean
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
          isLatin: currentSubset === 'latin',
        })
      }
    }
  }

  // Download font files
  let latinFont: any
  const downloadedFiles = await Promise.all(
    fontFiles.map(async ({ googleFontFileUrl, preloadFontFile, isLatin }) => {
      let cachedFontRequest = fontCache.get(googleFontFileUrl)
      const fontFileBuffer =
        cachedFontRequest ?? (await fetchFontFile(googleFontFileUrl))
      if (isLatin) {
        try {
          latinFont = fontFromBuffer(fontFileBuffer)
        } catch {}
      }
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
  if (adjustFontFallback && latinFont) {
    try {
      adjustFontFallbackMetrics = calculateFallbackFontValues(
        latinFont,
        require('next/dist/server/google-font-metrics.json')[fontFamily]
          .category
      )
    } catch {
      Log.error(
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
