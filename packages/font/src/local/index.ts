/* eslint-disable @typescript-eslint/no-unused-vars */
import type { FontModule } from 'next/font'
type Display = 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
type CssVariable = `--${string}`
type LocalFont = {
  src: string
  display?: Display
  weight?: string
  style?: string
  adjustFontFallback?: 'Arial' | 'Times New Roman' | false
  fallback?: string[]
  preload?: boolean
  variable?: CssVariable
  declarations?: Array<{ prop: string; value: string }>
}

export default function localFont(options: LocalFont): FontModule {
  throw new Error()
}
