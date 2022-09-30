import { AdjustFontFallback } from 'next/font'

const allowedDisplayValues = ['auto', 'block', 'swap', 'fallback', 'optional']

const formatValues = (values: string[]) =>
  values.map((val) => `\`${val}\``).join(', ')

const extToFormat = {
  woff: 'woff',
  woff2: 'woff2',
  ttf: 'truetype',
  otf: 'opentype',
  eot: 'embedded-opentype',
}

type FontOptions = {
  family: string
  files: Array<{
    file: string
    ext: string
    format: string
    unicodeRange?: string
  }>
  display: string
  weight?: string
  style?: string
  fallback?: string[]
  preload: boolean
  variable?: string
  ascentOverride?: string
  descentOverride?: string
  fontStretch?: string
  fontVariant?: string
  fontFeatureSettings?: string
  fontVariationSettings?: string
  lineGapOverride?: string
  sizeAdjust?: string
  adjustFontFallback?: AdjustFontFallback
}
export function validateData(functionName: string, data: any): FontOptions {
  if (functionName) {
    throw new Error(`@next/font/local has no named exports`)
  }
  let {
    src,
    display = 'optional',
    weight,
    style,
    fallback,
    preload = true,
    variable,
    ascentOverride,
    descentOverride,
    fontStretch,
    fontVariant,
    fontFeatureSettings,
    fontVariationSettings,
    lineGapOverride,
    sizeAdjust,
    adjustFontFallback,
  } = data[0] || ({} as any)

  if (!allowedDisplayValues.includes(display)) {
    throw new Error(
      `Invalid display value \`${display}\`.\nAvailable display values: ${formatValues(
        allowedDisplayValues
      )}`
    )
  }

  const srcArray = Array.isArray(src) ? src : [{ file: src }]

  if (srcArray.length === 0) {
    throw new Error('Src must contain one or more files')
  }

  const files = srcArray.map(({ file, unicodeRange }) => {
    if (!file) {
      throw new Error('Src array objects must have a `file` property')
    }
    if (srcArray.length > 1 && !unicodeRange) {
      throw new Error(
        "Files must have a unicode-range if there's more than one"
      )
    }

    const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(file)?.[1]
    if (!ext) {
      throw new Error(`Unexpected file \`${file}\``)
    }
    return {
      file,
      unicodeRange,
      ext,
      format: extToFormat[ext as 'woff' | 'woff2' | 'eot' | 'ttf' | 'otf'],
    }
  })

  const family = /.+\/(.+?)\./.exec(files[0].file)![1]

  return {
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
    fontStretch,
    fontVariant,
    fontFeatureSettings,
    fontVariationSettings,
    lineGapOverride,
    sizeAdjust,
    adjustFontFallback,
  }
}
