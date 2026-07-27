export type CssVariable = `--${string}`

export type Display = 'auto' | 'block' | 'swap' | 'fallback' | 'optional'

export type NextFont = {
  className: string
  style: { fontFamily: string; fontWeight?: number; fontStyle?: string }
}

export type NextFontWithVariable = NextFont & {
  variable: string
}
