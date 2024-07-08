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
    fallbackPaths: Array<{
      path: string
      ext: string
      format: string
    }>
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
 * Validate the data recieved from next-swc next-transform-font on next/font/local calls
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
    fallbackPaths,
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
    src = [{ path: src, fallbackPaths, weight, style }]
  } else {
    if (src.length === 0) {
      nextFontError('Unexpected empty `src` array.')
    }
  }

  const getExtensionAndFormat = (path: string) => {
    const ext = /\.(woff|woff2|eot|ttf|otf)$/.exec(path)?.[1] as
      | 'woff'
      | 'woff2'
      | 'eot'
      | 'ttf'
      | 'otf'
    if (!ext) {
      nextFontError(`Unexpected file \`${path}\``)
    }

    return { ext, format: extToFormat[ext] }
  }

  src = src.map((fontFile: any) => {
    return {
      ...fontFile,
      ...getExtensionAndFormat(fontFile.path),
      fallbackPaths: fontFile.fallbackPaths?.map((path: string) => ({
        path,
        ...getExtensionAndFormat(path),
      })),
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
