import { allowedDisplayValues } from '../constants'
import { formatAvailableValues } from '../format-available-values'
import { nextFontError } from '../next-font-error'

const extToFormat = {
  woff: 'woff',
  woff2: 'woff2',
  ttf: 'truetype',
  otf: 'opentype',
  eot: 'embedded-opentype',
}

type FontOptions = {
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

/**
 * Validate the data received from next-swc next-transform-font on next/font/local calls
 */
export function validateLocalFontFunctionCall(
  functionName: string,
  fontData: any
): FontOptions {
  if (functionName) {
    nextFontError(`next/font/local has no named exports`)
  }
  let {
    src,
    display = 'swap',
    weight,
    style,
    fallback,
    preload = true,
    variable,
    adjustFontFallback,
    declarations,
  } = fontData || ({} as any)

  if (!allowedDisplayValues.includes(display)) {
    nextFontError(
      `Invalid display value \`${display}\`.\nAvailable display values: ${formatAvailableValues(
        allowedDisplayValues
      )}`
    )
  }

  if (!src) {
    nextFontError('Missing required `src` property')
  }

  if (!Array.isArray(src)) {
    src = [{ path: src, weight, style }]
  } else {
    if (src.length === 0) {
      nextFontError('Unexpected empty `src` array.')
    }
  }

  src = src.map((fontFile: any) => {
    const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(fontFile.path)?.[1]
    if (!ext) {
      nextFontError(`Unexpected file \`${fontFile.path}\``)
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
        nextFontError(`Invalid declaration prop: \`${declaration.prop}\``)
      }
    })
  }

  return {
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
