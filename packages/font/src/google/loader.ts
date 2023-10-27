import type { AdjustFontFallback, FontLoader } from 'next/font'
// @ts-ignore
import * as Log from 'next/dist/build/output/log'
import { validateGoogleFontFunctionCall } from './validate-google-font-function-call'
import { getFontAxes } from './get-font-axes'
import { getGoogleFontsUrl } from './get-google-fonts-url'
import { nextFontError } from '../next-font-error'
import { findFontFilesInCss } from './find-font-files-in-css'
import { getFallbackFontOverrideMetrics } from './get-fallback-font-override-metrics'
import { fetchCSSFromGoogleFonts } from './fetch-css-from-google-fonts'
import { fetchFontFile } from './fetch-font-file'

const cssCache = new Map<string, string | null>()
const fontCache = new Map<string, Buffer | null>()

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

const nextFontGoogleFontLoader: FontLoader = async ({
  functionName,
  data,
  emitFontFile,
  isDev,
  isServer,
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
  } = validateGoogleFontFunctionCall(functionName, data[0])

  // Validate and get the font axes required to generated the URL
  const fontAxes = getFontAxes(
    fontFamily,
    weights,
    styles,
    selectedVariableAxes
  )

  // Generate the Google Fonts URL from the font family, axes and display value
  const url = getGoogleFontsUrl(fontFamily, fontAxes, display)

  // Get precalculated fallback font metrics, used to generate the fallback font CSS
  const adjustFontFallbackMetrics: AdjustFontFallback | undefined =
    adjustFontFallback ? getFallbackFontOverrideMetrics(fontFamily) : undefined

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
    /**
     * Hacky way to make sure the fetch is only done once.
     * Otherwise both the client and server compiler would fetch the CSS.
     * The reason we need to return the actual CSS from both the server and client is because a hash is generated based on the CSS content.
     */
    const hasCachedCSS = cssCache.has(url)
    // Fetch CSS from Google Fonts or get it from the cache
    let fontFaceDeclarations = hasCachedCSS
      ? cssCache.get(url)
      : await fetchCSSFromGoogleFonts(url, fontFamily, isDev).catch((err) => {
          console.error(err)
          return null
        })
    if (!hasCachedCSS) {
      cssCache.set(url, fontFaceDeclarations ?? null)
    } else {
      cssCache.delete(url)
    }
    if (fontFaceDeclarations == null) {
      nextFontError(`Failed to fetch \`${fontFamily}\` from Google Fonts.`)
    }

    // CSS Variables may be set on a body tag, ignore them to keep the CSS module pure
    fontFaceDeclarations = fontFaceDeclarations.split('body {', 1)[0]

    // Find font files to download, provide the array of subsets we want to preload if preloading is enabled
    const fontFiles = findFontFilesInCss(
      fontFaceDeclarations,
      preload ? subsets : undefined
    )

    // Download the font files extracted from the CSS
    const downloadedFiles = await Promise.all(
      fontFiles.map(async ({ googleFontFileUrl, preloadFontFile }) => {
        const hasCachedFont = fontCache.has(googleFontFileUrl)
        // Download the font file or get it from cache
        const fontFileBuffer = hasCachedFont
          ? fontCache.get(googleFontFileUrl)
          : await fetchFontFile(googleFontFileUrl, isDev).catch((err) => {
              console.error(err)
              return null
            })
        if (!hasCachedFont) {
          fontCache.set(googleFontFileUrl, fontFileBuffer ?? null)
        } else {
          fontCache.delete(googleFontFileUrl)
        }
        if (fontFileBuffer == null) {
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

    /**
     * Replace the @font-face sources with the self-hosted files we just downloaded to .next/static/media
     *
     * E.g.
     * @font-face {
     *   font-family: 'Inter';
     *   src: url(https://fonts.gstatic.com/...) -> url(/_next/static/media/_.woff2)
     * }
     */
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
    if (isDev) {
      if (isServer) {
        Log.error(
          `Failed to download \`${fontFamily}\` from Google Fonts. Using fallback font instead.\n\n${
            (err as Error).message
          }}`
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

export default nextFontGoogleFontLoader
