import type { AbsoluteTemplateString, TemplateString } from './metadata-types'

export type OpenGraphType =
  | 'article'
  | 'book'
  | 'music.song'
  | 'music.album'
  | 'music.playlist'
  | 'music.radio_station'
  | 'profile'
  | 'website'
  | 'video.tv_show'
  | 'video.other'
  | 'video.movie'
  | 'video.episode'

export type OpenGraph =
  | OpenGraphWebsite
  | OpenGraphArticle
  | OpenGraphBook
  | OpenGraphProfile
  | OpenGraphMusicSong
  | OpenGraphMusicAlbum
  | OpenGraphMusicPlaylist
  | OpenGraphRadioStation
  | OpenGraphVideoMovie
  | OpenGraphVideoEpisode
  | OpenGraphVideoTVShow
  | OpenGraphVideoOther
  | OpenGraphMetadata

// update this type to reflect actual locales
type Locale = string

type OpenGraphMetadata = {
  determiner?: 'a' | 'an' | 'the' | 'auto' | ''
  title?: string | TemplateString
  description?: string
  emails?: string | Array<string>
  phoneNumbers?: string | Array<string>
  faxNumbers?: string | Array<string>
  siteName?: string
  locale?: Locale
  alternateLocale?: Locale | Array<Locale>
  images?: OGImage | Array<OGImage>
  audio?: OGAudio | Array<OGAudio>
  videos?: OGVideo | Array<OGVideo>
  url?: string | URL
  countryName?: string
  ttl?: number
}
type OpenGraphWebsite = OpenGraphMetadata & {
  type: 'website'
}
type OpenGraphArticle = OpenGraphMetadata & {
  type: 'article'
  publishedTime?: string // datetime
  modifiedTime?: string // datetime
  expirationTime?: string // datetime
  authors?: null | string | URL | Array<string | URL>
  section?: null | string
  tags?: null | string | Array<string>
}
type OpenGraphBook = OpenGraphMetadata & {
  type: 'book'
  isbn?: null | string
  releaseDate?: null | string // datetime
  authors?: null | string | URL | Array<string | URL>
  tags?: null | string | Array<string>
}
type OpenGraphProfile = OpenGraphMetadata & {
  type: 'profile'
  firstName?: null | string
  lastName?: null | string
  username?: null | string
  gender?: null | string
}
type OpenGraphMusicSong = OpenGraphMetadata & {
  type: 'music.song'
  duration?: null | number
  albums?: null | string | URL | OGAlbum | Array<string | URL | OGAlbum>
  musicians?: null | string | URL | Array<string | URL>
}
type OpenGraphMusicAlbum = OpenGraphMetadata & {
  type: 'music.album'
  songs?: null | string | URL | OGSong | Array<string | URL | OGSong>
  musicians?: null | string | URL | Array<string | URL>
  releaseDate?: null | string // datetime
}
type OpenGraphMusicPlaylist = OpenGraphMetadata & {
  type: 'music.playlist'
  songs?: null | string | URL | OGSong | Array<string | URL | OGSong>
  creators?: null | string | URL | Array<string | URL>
}
type OpenGraphRadioStation = OpenGraphMetadata & {
  type: 'music.radio_station'
  creators?: null | string | URL | Array<string | URL>
}
type OpenGraphVideoMovie = OpenGraphMetadata & {
  type: 'video.movie'
  actors?: null | string | URL | OGActor | Array<string | URL | OGActor>
  directors?: null | string | URL | Array<string | URL>
  writers?: null | string | URL | Array<string | URL>
  duration?: null | number
  releaseDate?: null | string // datetime
  tags?: null | string | Array<string>
}
type OpenGraphVideoEpisode = OpenGraphMetadata & {
  type: 'video.episode'
  actors?: null | string | URL | OGActor | Array<string | URL | OGActor>
  directors?: null | string | URL | Array<string | URL>
  writers?: null | string | URL | Array<string | URL>
  duration?: null | number
  releaseDate?: null | string // datetime
  tags?: null | string | Array<string>
  series?: null | string | URL
}
type OpenGraphVideoTVShow = OpenGraphMetadata & {
  type: 'video.tv_show'
}
type OpenGraphVideoOther = OpenGraphMetadata & {
  type: 'video.other'
}

type OGImage = string | OGImageDescriptor | URL
type OGImageDescriptor = {
  url: string | URL
  secureUrl?: string | URL
  alt?: string
  type?: string
  width?: string | number
  height?: string | number
}
type OGAudio = string | OGAudioDescriptor | URL
type OGAudioDescriptor = {
  url: string | URL
  secureUrl?: string | URL
  type?: string
}
type OGVideo = string | OGVideoDescriptor | URL
type OGVideoDescriptor = {
  url: string | URL
  secureUrl?: string | URL
  type?: string
  width?: string | number
  height?: string | number
}

export type ResolvedOpenGraph =
  | ResolvedOpenGraphWebsite
  | ResolvedOpenGraphArticle
  | ResolvedOpenGraphBook
  | ResolvedOpenGraphProfile
  | ResolvedOpenGraphMusicSong
  | ResolvedOpenGraphMusicAlbum
  | ResolvedOpenGraphMusicPlaylist
  | ResolvedOpenGraphRadioStation
  | ResolvedOpenGraphVideoMovie
  | ResolvedOpenGraphVideoEpisode
  | ResolvedOpenGraphVideoTVShow
  | ResolvedOpenGraphVideoOther
  | ResolvedOpenGraphMetadata

type ResolvedOpenGraphMetadata = {
  determiner?: 'a' | 'an' | 'the' | 'auto' | ''
  title: AbsoluteTemplateString
  description?: string
  emails?: Array<string>
  phoneNumbers?: Array<string>
  faxNumbers?: Array<string>
  siteName?: string
  locale?: Locale
  alternateLocale?: Array<Locale>
  images?: Array<OGImage>
  audio?: Array<OGAudio>
  videos?: Array<OGVideo>
  url: null | URL | string
  countryName?: string
  ttl?: number
}
type ResolvedOpenGraphWebsite = ResolvedOpenGraphMetadata & {
  type: 'website'
}
type ResolvedOpenGraphArticle = ResolvedOpenGraphMetadata & {
  type: 'article'
  publishedTime?: string // datetime
  modifiedTime?: string // datetime
  expirationTime?: string // datetime
  authors?: Array<string>
  section?: string
  tags?: Array<string>
}
type ResolvedOpenGraphBook = ResolvedOpenGraphMetadata & {
  type: 'book'
  isbn?: string
  releaseDate?: string // datetime
  authors?: Array<string>
  tags?: Array<string>
}
type ResolvedOpenGraphProfile = ResolvedOpenGraphMetadata & {
  type: 'profile'
  firstName?: string
  lastName?: string
  username?: string
  gender?: string
}
type ResolvedOpenGraphMusicSong = ResolvedOpenGraphMetadata & {
  type: 'music.song'
  duration?: number
  albums?: Array<OGAlbum>
  musicians?: Array<string | URL>
}
type ResolvedOpenGraphMusicAlbum = ResolvedOpenGraphMetadata & {
  type: 'music.album'
  songs?: Array<string | URL | OGSong>
  musicians?: Array<string | URL>
  releaseDate?: string // datetime
}
type ResolvedOpenGraphMusicPlaylist = ResolvedOpenGraphMetadata & {
  type: 'music.playlist'
  songs?: Array<string | URL | OGSong>
  creators?: Array<string | URL>
}
type ResolvedOpenGraphRadioStation = ResolvedOpenGraphMetadata & {
  type: 'music.radio_station'
  creators?: Array<string | URL>
}
type ResolvedOpenGraphVideoMovie = ResolvedOpenGraphMetadata & {
  type: 'video.movie'
  actors?: Array<string | URL | OGActor>
  directors?: Array<string | URL>
  writers?: Array<string | URL>
  duration?: number
  releaseDate?: string // datetime
  tags?: Array<string>
}
type ResolvedOpenGraphVideoEpisode = ResolvedOpenGraphMetadata & {
  type: 'video.episode'
  actors?: Array<string | URL | OGActor>
  directors?: Array<string | URL>
  writers?: Array<string | URL>
  duration?: number
  releaseDate?: string // datetime
  tags?: Array<string>
  series?: string | URL
}
type ResolvedOpenGraphVideoTVShow = ResolvedOpenGraphMetadata & {
  type: 'video.tv_show'
}
type ResolvedOpenGraphVideoOther = ResolvedOpenGraphMetadata & {
  type: 'video.other'
}

type OGSong = {
  url: string | URL
  disc?: number
  track?: number
}
type OGAlbum = {
  url: string | URL
  disc?: number
  track?: number
}
type OGActor = {
  url: string | URL
  role?: string
}
