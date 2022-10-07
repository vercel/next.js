// @ts-ignore
import { calculateSizeAdjustValues } from 'next/dist/server/font-utils'
// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
import fontFromBuffer from '@next/font/dist/fontkit'
import type { AdjustFontFallback, FontLoader } from 'next/font'

import { promisify } from 'util'
import { validateData } from './utils'

const fetchFonts: FontLoader = async ({
  functionName,
  data,
  emitFontFile,
  resolve,
  fs,
}) => {
  const {
    family,
    src,
    ext,
    format,
    display,
    weight,
    style,
    fallback,
    preload,
    variable,
    ascentOverride,
    descentOverride,
    lineGapOverride,
    fontStretch,
    fontFeatureSettings,
    sizeAdjust,
    adjustFontFallback,
  } = validateData(functionName, data)

  const resolved = await resolve(src)
  const fileBuffer = await promisify(fs.readFile)(resolved)
  const fontUrl = emitFontFile(fileBuffer, ext, preload)

  let fontMetadata: any
  try {
    fontMetadata = fontFromBuffer(fileBuffer)
  } catch (e) {
    console.error(`Failed to load font file: ${resolved}\n${e}`)
  }

  // Add fallback font
  let adjustFontFallbackMetrics: AdjustFontFallback | undefined
  if (fontMetadata && adjustFontFallback !== false) {
    const {
      ascent,
      descent,
      lineGap,
      fallbackFont,
      sizeAdjust: fallbackSizeAdjust,
    } = calculateSizeAdjustValues({
      category:
        adjustFontFallback === 'Times New Roman' ? 'serif' : 'sans-serif',
      ascent: fontMetadata.ascent,
      descent: fontMetadata.descent,
      lineGap: fontMetadata.lineGap,
      unitsPerEm: fontMetadata.unitsPerEm,
      xAvgCharWidth: (fontMetadata as any)['OS/2']?.xAvgCharWidth,
    })
    adjustFontFallbackMetrics = {
      fallbackFont,
      ascentOverride: `${ascent}%`,
      descentOverride: `${descent}%`,
      lineGapOverride: `${lineGap}%`,
      sizeAdjust: `${fallbackSizeAdjust}%`,
    }
  }

  const fontFaceProperties = [
    ['font-family', `'${fontMetadata?.familyName ?? family}'`],
    ['src', `url(${fontUrl}) format('${format}')`],
    ['font-display', display],
    ...(weight ? [['font-weight', weight]] : []),
    ...(style ? [['font-style', style]] : []),
    ...(ascentOverride ? [['ascent-override', ascentOverride]] : []),
    ...(descentOverride ? [['descent-override', descentOverride]] : []),
    ...(lineGapOverride ? [['line-gap-override', lineGapOverride]] : []),
    ...(fontStretch ? [['font-stretch', fontStretch]] : []),
    ...(fontFeatureSettings
      ? [['font-feature-settings', fontFeatureSettings]]
      : []),
    ...(sizeAdjust ? [['size-adjust', sizeAdjust]] : []),
  ]

  const css = `@font-face {
${fontFaceProperties
  .map(([property, value]) => `${property}: ${value};`)
  .join('\n')}
}`

  return {
    css,
    fallbackFonts: fallback,
    weight,
    style,
    variable,
    adjustFontFallback: adjustFontFallbackMetrics,
  }
}

export default fetchFonts
