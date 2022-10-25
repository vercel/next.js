// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
import fontFromBuffer from '@next/font/dist/fontkit'
import type { AdjustFontFallback, FontLoader } from 'next/font'

import { promisify } from 'util'
import { validateData } from './utils'
import { calculateFallbackFontValues } from '../utils'

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
    adjustFontFallback,
    declarations,
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
    adjustFontFallbackMetrics = calculateFallbackFontValues(
      fontMetadata,
      adjustFontFallback === 'Times New Roman' ? 'serif' : 'sans-serif'
    )
  }

  const fontFaceProperties = [
    ...(declarations
      ? declarations.map(({ prop, value }) => [prop, value])
      : []),
    ['font-family', `'${fontMetadata?.familyName ?? family}'`],
    ['src', `url(${fontUrl}) format('${format}')`],
    ['font-display', display],
    ...(weight ? [['font-weight', weight]] : []),
    ...(style ? [['font-style', style]] : []),
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
