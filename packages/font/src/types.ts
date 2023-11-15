export type { Display } from './constants'
export type CssVariable = `--${string}`

export type NextFont = {
  className: string
  style: { fontFamily: string; fontWeight?: number; fontStyle?: string }
}

export type NextFontWithVariable = NextFont & {
  variable: string
}
