declare global {
  interface Window {
    dataLayer?: Object[]
    [key: string]: any
  }
}

type JSONValue =
  | string
  | number
  | boolean
  | JSONValue[]
  | { [key: string]: JSONValue }

type GTMParamsBaseParams = {
  dataLayer?: { [key: string]: JSONValue }
  dataLayerName?: string
  auth?: string
  preview?: string
  nonce?: string
}

type GTMParamsWithId = GTMParamsBaseParams & {
  gtmId: string
  gtmScriptUrl?: string
}

type GTMParamsWithScriptUrl = GTMParamsBaseParams & {
  gtmId?: string
  gtmScriptUrl: string
}

export type GTMParams = GTMParamsWithId | GTMParamsWithScriptUrl

export type GAParams = {
  gaId: string
  dataLayerName?: string
  debugMode?: boolean
  nonce?: string
}

export type GoogleMapsEmbed = {
  height?: number | string
  width?: number | string
  mode: 'place' | 'view' | 'directions' | 'streetview' | 'search'
  apiKey: string
  style?: string
  allowfullscreen?: boolean
  loading?: 'eager' | 'lazy'
  q?: string
  id?: string
  center?: string
  zoom?: string
  maptype?: string
  language?: string
  region?: string
}

export type YouTubeEmbed = {
  height?: number
  width?: number
  videoid: string
  playlabel?: string
  params?: string
  style?: string
}
