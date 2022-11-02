export type FontModule = {
  className: string
  variable?: string
  style: { fontFamily: string; fontWeight?: number; fontStyle?: string }
}

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
  config: any
  emitFontFile: (content: Buffer, ext: string, preload: boolean) => string
  resolve: (src: string) => string
  fs: any
  isServer: boolean
}) => Promise<{
  css: string
  fallbackFonts?: string[]
  variable?: string
  adjustFontFallback?: AdjustFontFallback
  weight?: string
  style?: string
}>
