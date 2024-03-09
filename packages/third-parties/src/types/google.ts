declare global {
  interface Window {
    dataLayer?: Object[]
    [key: string]: any
  }
}

export type GTMParams = {
  gtmId: string
  dataLayer?: string[]
  dataLayerName?: string
  auth?: string
  preview?: string
}

export type GAParams = {
  gaId: string
  dataLayerName?: string
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
