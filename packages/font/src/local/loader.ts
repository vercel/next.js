// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
let fontFromBuffer: any
try {
  const mod = require('../fontkit').default
  fontFromBuffer = mod.default || mod
} catch {}
import type { AdjustFontFallback, FontLoader } from 'next/font'

import { promisify } from 'util'
import { pickFontFileForFallbackGeneration } from './pick-font-file-for-fallback-generation'
import { getFallbackMetricsFromFontFile } from './get-fallback-metrics-from-font-file'
import { validateLocalFontFunctionCall } from './validate-local-font-function-call'

const nextFontLocalFontLoader: FontLoader = async ({
  functionName,
  variableName,
  data,
  emitFontFile,
  resolve,
  loaderContext,
}) => {
  const {
    src,
    display,
    fallback,
    preload,
    variable,
    adjustFontFallback,
    declarations,
    weight: defaultWeight,
    style: defaultStyle,
  } = validateLocalFontFunctionCall(functionName, data[0])

  const resolveFont = async ({ path, ext }: { path: string; ext: string }) => {
    const resolved = await resolve(path)
    const fileBuffer = await promisify(loaderContext.fs.readFile)(resolved)
    const fontUrl = emitFontFile(
      fileBuffer,
      ext,
      preload,
      typeof adjustFontFallback === 'undefined' || !!adjustFontFallback
    )

    return { resolved, fileBuffer, fontUrl }
  }

  const generateFontFaceSrc = async ({
    path,
    ext,
    format,
  }: {
    path: string
    ext: string
    format: string
  }) => {
    const { fontUrl } = await resolveFont({ path, ext })

    return `url(${fontUrl}) format('${format}')`
  }

  // Load all font files and emit them to the .next output directory
  // Also generate a @font-face CSS for each font file
  const fontFiles = await Promise.all(
    src.map(async ({ path, style, weight, ext, format, fallbackPaths }) => {
      const { resolved, fileBuffer, fontUrl } = await resolveFont({ path, ext })

      // Try to load font metadata from the font file using fontkit.
      // The data is used to calculate the fallback font override values.
      let fontMetadata: any
      try {
        fontMetadata = fontFromBuffer?.(fileBuffer)
      } catch (e) {
        console.error(`Failed to load font file: ${resolved}\n${e}`)
      }

      // Get all values that should be added to the @font-face declaration
      const fontFaceProperties = [
        ...(declarations
          ? declarations.map(({ prop, value }) => [prop, value])
          : []),
        ['font-family', variableName],
        [
          'src',
          [
            `url(${fontUrl}) format('${format}')`,
            ...(await Promise.all(fallbackPaths.map(generateFontFaceSrc))),
          ].join(','),
        ],
        ['font-display', display],
        ...(weight ?? defaultWeight
          ? [['font-weight', weight ?? defaultWeight]]
          : []),
        ...(style ?? defaultStyle
          ? [['font-style', style ?? defaultStyle]]
          : []),
      ]

      // Generate the @font-face CSS from the font-face properties
      const css = `@font-face {\n${fontFaceProperties
        .map(([property, value]) => `${property}: ${value};`)
        .join('\n')}\n}\n`

      return {
        css,
        fontMetadata,
        weight,
        style,
      }
    })
  )

  // Calculate the fallback font override values using the font file metadata
  let adjustFontFallbackMetrics: AdjustFontFallback | undefined
  if (adjustFontFallback !== false) {
    const fallbackFontFile = pickFontFileForFallbackGeneration(fontFiles)
    if (fallbackFontFile.fontMetadata) {
      adjustFontFallbackMetrics = getFallbackMetricsFromFontFile(
        fallbackFontFile.fontMetadata,
        adjustFontFallback === 'Times New Roman' ? 'serif' : 'sans-serif'
      )
    }
  }

  return {
    css: fontFiles.map(({ css }) => css).join('\n'),
    fallbackFonts: fallback,
    weight: src.length === 1 ? src[0].weight : undefined,
    style: src.length === 1 ? src[0].style : undefined,
    variable,
    adjustFontFallback: adjustFontFallbackMetrics,
  }
}

export default nextFontLocalFontLoader
