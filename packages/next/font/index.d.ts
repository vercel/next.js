export type FontModule = {
  className: string
  variable: string
  style: { fontFamily: string; fontWeight?: number; fontStyle?: string }
}

export type FontLoader = (options: {
  functionName: string
  data: any[]
  config: any
  emitFontFile: (content: Buffer, ext: string, preload: boolean) => string
  resolve: (src: string) => string
  fs: any
}) => Promise<{ css: string; fallbackFonts?: string[] }>
