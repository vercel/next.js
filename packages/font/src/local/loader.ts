import type { FontLoader } from 'next/font'

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
    files,
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

  const fontFaces = await Promise.all(
    files.map(async ({ file, ext, format, unicodeRange }) => {
      const resolved = await resolve(file)
      const fileBuffer = await promisify(fs.readFile)(resolved)

      const fontUrl = emitFontFile(fileBuffer, ext, preload)

      const fontFaceProperties = [
        ['font-family', `'${family}'`],
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
        ...(unicodeRange ? [['unicode-range', unicodeRange]] : ''),
      ]

      return `@font-face {
${fontFaceProperties
  .map(([property, value]) => `${property}: ${value};`)
  .join('\n')}
}`
    })
  )

  return {
    css: fontFaces.join('\n'),
    fallbackFonts: fallback,
    weight,
    style,
    variable,
    adjustFontFallback,
  }
}

export default fetchFonts
