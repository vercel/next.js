/* eslint-disable @typescript-eslint/no-unused-vars */
import type { FontModule } from 'next/font'
type Display = 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
type LocalFont = {
  src: string | Array<{ file: string; unicodeRange: string }>
  display?: Display
  weight?: string
  style?: string
  fallback?: string[]
  preload?: boolean

  ascentOverride?: string
  descentOverride?: string
  fontStretch?: string
  fontVariant?: string
  fontFeatureSettings?: string
  fontVariationSettings?: string
  lineGapOverride?: string
  sizeAdjust?: string
}

export default function localFont(options: LocalFont): FontModule {
  throw new Error()
}
