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
