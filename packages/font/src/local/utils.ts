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
  src: Array<{
    path: string
    weight?: string
    style?: string
    ext: string
    format: string
  }>
  display: string
  weight?: string
  style?: string
  fallback?: string[]
  preload: boolean
  variable?: string
  adjustFontFallback?: string | false
  declarations?: Array<{ prop: string; value: string }>
}
export function validateData(functionName: string, fontData: any): FontOptions {
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
    adjustFontFallback,
    declarations,
  } = fontData || ({} as any)

  if (!allowedDisplayValues.includes(display)) {
    throw new Error(
      `Invalid display value \`${display}\`.\nAvailable display values: ${formatValues(
        allowedDisplayValues
      )}`
    )
  }

  if (!src) {
    throw new Error('Missing required `src` property')
  }

  if (!Array.isArray(src)) {
    src = [{ path: src, weight, style }]
  } else {
    if (src.length === 0) {
      throw new Error('Unexpected empty `src` array.')
    }
  }

  let family: string | undefined
  src = src.map((fontFile: any) => {
    const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(fontFile.path)?.[1]
    if (!ext) {
      throw new Error(`Unexpected file \`${fontFile.path}\``)
    }
    if (!family) {
      family = /(.*\/)?(.+?)\.(woff|woff2|eot|ttf|otf)$/.exec(fontFile.path)![2]
    }

    return {
      ...fontFile,
      ext,
      format: extToFormat[ext as 'woff' | 'woff2' | 'eot' | 'ttf' | 'otf'],
    }
  })

  if (Array.isArray(declarations)) {
    declarations.forEach((declaration) => {
      if (
        [
          'font-family',
          'src',
          'font-display',
          'font-weight',
          'font-style',
        ].includes(declaration?.prop)
      ) {
        throw new Error(`Invalid declaration prop: \`${declaration.prop}\``)
      }
    })
  }

  return {
    family: family!,
    src,
    display,
    weight,
    style,
    fallback,
    preload,
    variable,
    adjustFontFallback,
    declarations,
  }
}
