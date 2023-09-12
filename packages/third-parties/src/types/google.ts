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
}
