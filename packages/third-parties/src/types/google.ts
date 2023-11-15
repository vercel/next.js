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

export type GoogleMapsEmbed = {
  height?: number
  width?: number
  mode: 'place' | 'view' | 'directions' | 'streetview' | 'search'
  apiKey: string
  style: string
  allowfullscreen: boolean
  loading: 'eager' | 'lazy'
  q?: string
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
