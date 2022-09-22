import type { FontLoader } from 'next/font'
// @ts-ignore
import fetch from 'next/dist/compiled/node-fetch'
// @ts-ignore
import { calculateOverrideCSS } from 'next/dist/server/font-utils'
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
  if (adjustFontFallback) {
    try {
      updatedCssResponse += calculateOverrideCSS(
        fontFamily,
        require('next/dist/server/google-font-metrics.json')
      )
    } catch (e) {
      console.log('Error getting font override values - ', e)
    }
  }

  return {
    css: updatedCssResponse,
    fallbackFonts: fallback,
  }
}

export default downloadGoogleFonts
