/* eslint-disable @typescript-eslint/no-unused-vars */
import type { AdjustFontFallback, FontModule } from 'next/font'
type Display = 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
type CssVariable = `--${string}`
type LocalFont = {
  src: string | Array<{ file: string; unicodeRange: string }>
  display?: Display
  weight?: number
  style?: string
  fallback?: string[]
  preload?: boolean
  variable?: CssVariable

  fontStretch?: string
  fontVariant?: string
  fontFeatureSettings?: string
  fontVariationSettings?: string
  ascentOverride?: string
  descentOverride?: string
  lineGapOverride?: string
  sizeAdjust?: string

  adjustFontFallback?: AdjustFontFallback
}

export default function localFont(options: LocalFont): FontModule {
  throw new Error()
}
