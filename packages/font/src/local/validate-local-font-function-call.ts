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
    pathFallback: Array<{
      path: string
      ext: string
      format: string
      preload: boolean
    }>
    weight?: string
    style?: string
    ext: string
    format: string
    declarations?: Array<{ prop: string; value: string }>
    preload: boolean
  }>
  display: string
  weight?: string
  style?: string
  fallback?: string[]
  variable?: string
  adjustFontFallback?: string | false
  declarations?: Array<{ prop: string; value: string }>
}

function validateLocalFontDeclarations(
  declarations: Array<{ prop: string; value: string }> | undefined
): void {
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
    pathFallback = [],
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
    src = [
      {
        path: src,
        pathFallback: pathFallback.map((path: string) => ({
          path,
          preload: preload,
          ...getExtensionAndFormat(path),
        })),
        weight,
        style,
      },
    ]
  } else {
    if (src.length === 0) {
      nextFontError('Unexpected empty `src` array.')
    }
  }

  src = src.map(
    (fontFile: {
      path: string
      pathFallback?: string[]
      weight?: string
      style?: string
      preload?: boolean
      declarations?: Array<{ prop: string; value: string }>
    }) => {
      validateLocalFontDeclarations(fontFile.declarations)
      return {
        ...fontFile,
        ...getExtensionAndFormat(fontFile.path),
        pathFallback: pathFallback
          .concat(fontFile.pathFallback ?? [])
          .map((path: string) => ({
            path,
            preload: fontFile.preload ?? preload,
            ...getExtensionAndFormat(path),
          })),
        preload: fontFile.preload ?? preload,
      }
    }
  )

  if (Array.isArray(declarations)) {
    validateLocalFontDeclarations(declarations)
  }

  return {
    src,
    display,
    weight,
    style,
    fallback,
    variable,
    adjustFontFallback,
    declarations,
  }
}
