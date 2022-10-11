/* eslint-disable @typescript-eslint/no-unused-vars */
import type { FontModule } from 'next/font'
type Display = 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
type CssVariable = `--${string}`
type LocalFont = {
  src: string
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

  adjustFontFallback?: 'Arial' | 'Times New Roman' | false
}

export default function localFont(options: LocalFont): FontModule {
  throw new Error()
}
