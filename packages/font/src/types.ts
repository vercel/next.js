export type AdjustFontFallback = {
  fallbackFont: string
  ascentOverride?: string
  descentOverride?: string
  lineGapOverride?: string
  sizeAdjust?: string
}

export type FontLoader = (options: {
  functionName: string
  variableName: string
  data: any[]
  emitFontFile: (
    content: Buffer,
    ext: string,
    preload: boolean,
    isUsingSizeAdjust?: boolean
  ) => string
  resolve: (src: string) => string
  isDev: boolean
  isServer: boolean
  loaderContext: any
}) => Promise<{
  css: string
  fallbackFonts?: string[]
  variable?: string
  adjustFontFallback?: AdjustFontFallback
  weight?: string
  style?: string
}>

export type CssVariable = `--${string}`

export type Display = 'auto' | 'block' | 'swap' | 'fallback' | 'optional'

export type NextFont = {
  className: string
  style: { fontFamily: string; fontWeight?: number; fontStyle?: string }
}

export type NextFontWithVariable = NextFont & {
  variable: string
}
