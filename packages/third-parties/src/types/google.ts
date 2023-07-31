export type GoogleMapsEmbed = {
  height?: number
  width?: number
  mapMode: 'place' | 'view' | 'directions' | 'streetview' | 'search'
  apiKey: string
  parameters: string
  style: string
  allowfullscreen: boolean
  loading: string
}

export type YoutubeEmbed = {
  height?: number
  width?: number
  videoid: string
  playlabel?: string
}
