export interface CssImport {
  icss?: boolean
  importName: string
  url: string
  type?: 'url' | string
}

export interface CssExport {
  name: string
  value: string
}

export interface ApiParam {
  url: string
  importName?: string

  layer: string
  supports: string
  media: string

  dedupe?: boolean
}

export interface ApiReplacement {
  replacementName: string
  localName: string
  importName: string
  needQuotes: boolean
  hash: string
}
