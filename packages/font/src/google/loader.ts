import type { AdjustFontFallback, FontLoader } from 'next/font'
// @ts-ignore
import { calculateSizeAdjustValues } from 'next/dist/server/font-utils'
// @ts-ignore
import * as Log from 'next/dist/build/output/log'
import {
  fetchCSSFromGoogleFonts,
  fetchFontFile,
  getFontAxes,
  getUrl,
  validateData,
} from './utils'
import { nextFontError } from '../utils'

const cssCache = new Map<string, Promise<string>>()
const fontCache = new Map<string, any>()

// regexp is based on https://github.com/sindresorhus/escape-string-regexp
const reHasRegExp = /[|\\{}()[\]^$+*?.-]/
const reReplaceRegExp = /[|\\{}()[\]^$+*?.-]/g

function escapeStringRegexp(str: string) {
  // see also: https://github.com/lodash/lodash/blob/2da024c3b4f9947a48517639de7560457cd4ec6c/escapeRegExp.js#L23
  if (reHasRegExp.test(str)) {
    return str.replace(reReplaceRegExp, '\\$&')
  }
  return str
}

const downloadGoogleFonts: FontLoader = async ({
  functionName,
  data,
  config,
  emitFontFile,
  isDev,
  isServer,
  loaderContext,
}) => {
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
    subsets,
  } = validateData(functionName, data, config)

  const fontAxes = getFontAxes(
    fontFamily,
    weights,
    styles,
    selectedVariableAxes
  )
  const url = getUrl(fontFamily, fontAxes, display)

  // Find fallback font metrics
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

  const result = {
    fallbackFonts: fallback,
    weight:
      weights.length === 1 && weights[0] !== 'variable'
        ? weights[0]
        : undefined,
    style: styles.length === 1 ? styles[0] : undefined,
    variable,
    adjustFontFallback: adjustFontFallbackMetrics,
  }

  try {
    const hasCachedCSS = cssCache.has(url)
    let fontFaceDeclarations = hasCachedCSS
      ? cssCache.get(url)
      : await fetchCSSFromGoogleFonts(url, fontFamily).catch(() => null)
    if (!hasCachedCSS) {
      cssCache.set(url, fontFaceDeclarations)
    } else {
      cssCache.delete(url)
    }
    if (fontFaceDeclarations === null) {
      nextFontError(`Failed to fetch \`${fontFamily}\` from Google Fonts.`)
    }

    // CSS Variables may be set on a body tag, ignore them to keep the CSS module pure
    fontFaceDeclarations = fontFaceDeclarations.split('body {')[0]

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
        if (
          googleFontFileUrl &&
          !fontFiles.some(
            (foundFile) => foundFile.googleFontFileUrl === googleFontFileUrl
          )
        ) {
          fontFiles.push({
            googleFontFileUrl,
            preloadFontFile: !!preload && subsets.includes(currentSubset),
          })
        }
      }
    }

    // Download font files
    const downloadedFiles = await Promise.all(
      fontFiles.map(async ({ googleFontFileUrl, preloadFontFile }) => {
        const hasCachedFont = fontCache.has(googleFontFileUrl)
        const fontFileBuffer = hasCachedFont
          ? fontCache.get(googleFontFileUrl)
          : await fetchFontFile(googleFontFileUrl).catch(() => null)
        if (!hasCachedFont) {
          fontCache.set(googleFontFileUrl, fontFileBuffer)
        } else {
          fontCache.delete(googleFontFileUrl)
        }
        if (fontFileBuffer === null) {
          nextFontError(`Failed to fetch \`${fontFamily}\` from Google Fonts.`)
        }

        const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)![1]
        // Emit font file to .next/static/media
        const selfHostedFileUrl = emitFontFile(
          fontFileBuffer,
          ext,
          preloadFontFile,
          !!adjustFontFallbackMetrics
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
        new RegExp(escapeStringRegexp(googleFontFileUrl), 'g'),
        selfHostedFileUrl
      )
    }

    return {
      ...result,
      css: updatedCssResponse,
    }
  } catch (err) {
    loaderContext.cacheable(false)
    if (isDev) {
      if (isServer) {
        console.error(err)
        Log.error(
          `Failed to download \`${fontFamily}\` from Google Fonts. Using fallback font instead.`
        )
      }

      // In dev we should return the fallback font instead of throwing an error
      let css = `@font-face {
  font-family: '${fontFamily} Fallback';
  src: local("${adjustFontFallbackMetrics?.fallbackFont ?? 'Arial'}");`
      if (adjustFontFallbackMetrics) {
        css += `
  ascent-override:${adjustFontFallbackMetrics.ascentOverride};
  descent-override:${adjustFontFallbackMetrics.descentOverride};
  line-gap-override:${adjustFontFallbackMetrics.lineGapOverride};
  size-adjust:${adjustFontFallbackMetrics.sizeAdjust};`
      }
      css += '\n}'

      return {
        ...result,
        css,
      }
    } else {
      throw err
    }
  }
}

export default downloadGoogleFonts
