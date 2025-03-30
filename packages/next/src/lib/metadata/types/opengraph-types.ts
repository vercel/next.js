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
  determiner?: 'a' | 'an' | 'the' | 'auto' | '' | undefined
  title?: string | TemplateString | undefined
  description?: string | undefined
  emails?: string | Array<string> | undefined
  phoneNumbers?: string | Array<string> | undefined
  faxNumbers?: string | Array<string> | undefined
  siteName?: string | undefined
  locale?: Locale | undefined
  alternateLocale?: Locale | Array<Locale> | undefined
  images?: OGImage | Array<OGImage> | undefined
  audio?: OGAudio | Array<OGAudio> | undefined
  videos?: OGVideo | Array<OGVideo> | undefined
  url?: string | URL | undefined
  countryName?: string | undefined
  ttl?: number | undefined
}
type OpenGraphWebsite = OpenGraphMetadata & {
  type: 'website'
}
type OpenGraphArticle = OpenGraphMetadata & {
  type: 'article'
  publishedTime?: string | undefined // datetime
  modifiedTime?: string | undefined // datetime
  expirationTime?: string | undefined // datetime
  authors?: null | string | URL | Array<string | URL> | undefined
  section?: null | string | undefined
  tags?: null | string | Array<string> | undefined
}
type OpenGraphBook = OpenGraphMetadata & {
  type: 'book'
  isbn?: null | string | undefined
  releaseDate?: null | string | undefined // datetime
  authors?: null | string | URL | Array<string | URL> | undefined
  tags?: null | string | Array<string> | undefined
}
type OpenGraphProfile = OpenGraphMetadata & {
  type: 'profile'
  firstName?: null | string | undefined
  lastName?: null | string | undefined
  username?: null | string | undefined
  gender?: null | string | undefined
}
type OpenGraphMusicSong = OpenGraphMetadata & {
  type: 'music.song'
  duration?: null | number | undefined
  albums?:
    | null
    | string
    | URL
    | OGAlbum
    | Array<string | URL | OGAlbum>
    | undefined
  musicians?: null | string | URL | Array<string | URL> | undefined
}
type OpenGraphMusicAlbum = OpenGraphMetadata & {
  type: 'music.album'
  songs?:
    | null
    | string
    | URL
    | OGSong
    | Array<string | URL | OGSong>
    | undefined
  musicians?: null | string | URL | Array<string | URL> | undefined
  releaseDate?: null | string | undefined // datetime
}
type OpenGraphMusicPlaylist = OpenGraphMetadata & {
  type: 'music.playlist'
  songs?:
    | null
    | string
    | URL
    | OGSong
    | Array<string | URL | OGSong>
    | undefined
  creators?: null | string | URL | Array<string | URL> | undefined
}
type OpenGraphRadioStation = OpenGraphMetadata & {
  type: 'music.radio_station'
  creators?: null | string | URL | Array<string | URL> | undefined
}
type OpenGraphVideoMovie = OpenGraphMetadata & {
  type: 'video.movie'
  actors?:
    | null
    | string
    | URL
    | OGActor
    | Array<string | URL | OGActor>
    | undefined
  directors?: null | string | URL | Array<string | URL> | undefined
  writers?: null | string | URL | Array<string | URL> | undefined
  duration?: null | number | undefined
  releaseDate?: null | string | undefined // datetime
  tags?: null | string | Array<string> | undefined
}
type OpenGraphVideoEpisode = OpenGraphMetadata & {
  type: 'video.episode'
  actors?:
    | null
    | string
    | URL
    | OGActor
    | Array<string | URL | OGActor>
    | undefined
  directors?: null | string | URL | Array<string | URL> | undefined
  writers?: null | string | URL | Array<string | URL> | undefined
  duration?: null | number | undefined
  releaseDate?: null | string | undefined // datetime
  tags?: null | string | Array<string> | undefined
  series?: null | string | URL | undefined
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
  secureUrl?: string | URL | undefined
  alt?: string | undefined
  type?: string | undefined
  width?: string | number | undefined
  height?: string | number | undefined
}
type OGAudio = string | OGAudioDescriptor | URL
type OGAudioDescriptor = {
  url: string | URL
  secureUrl?: string | URL | undefined
  type?: string | undefined
}
type OGVideo = string | OGVideoDescriptor | URL
type OGVideoDescriptor = {
  url: string | URL
  secureUrl?: string | URL | undefined
  type?: string | undefined
  width?: string | number | undefined
  height?: string | number | undefined
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
  determiner?: 'a' | 'an' | 'the' | 'auto' | '' | undefined
  title: AbsoluteTemplateString
  description?: string | undefined
  emails?: Array<string> | undefined
  phoneNumbers?: Array<string> | undefined
  faxNumbers?: Array<string> | undefined
  siteName?: string | undefined
  locale?: Locale | undefined
  alternateLocale?: Array<Locale> | undefined
  images?: Array<OGImage> | undefined
  audio?: Array<OGAudio> | undefined
  videos?: Array<OGVideo> | undefined
  url: null | URL | string
  countryName?: string | undefined
  ttl?: number | undefined
}
type ResolvedOpenGraphWebsite = ResolvedOpenGraphMetadata & {
  type: 'website'
}
type ResolvedOpenGraphArticle = ResolvedOpenGraphMetadata & {
  type: 'article'
  publishedTime?: string | undefined // datetime
  modifiedTime?: string | undefined // datetime
  expirationTime?: string | undefined // datetime
  authors?: Array<string> | undefined
  section?: string | undefined
  tags?: Array<string> | undefined
}
type ResolvedOpenGraphBook = ResolvedOpenGraphMetadata & {
  type: 'book'
  isbn?: string | undefined
  releaseDate?: string | undefined // datetime
  authors?: Array<string> | undefined
  tags?: Array<string> | undefined
}
type ResolvedOpenGraphProfile = ResolvedOpenGraphMetadata & {
  type: 'profile'
  firstName?: string | undefined
  lastName?: string | undefined
  username?: string | undefined
  gender?: string | undefined
}
type ResolvedOpenGraphMusicSong = ResolvedOpenGraphMetadata & {
  type: 'music.song'
  duration?: number | undefined
  albums?: Array<OGAlbum> | undefined
  musicians?: Array<string | URL> | undefined
}
type ResolvedOpenGraphMusicAlbum = ResolvedOpenGraphMetadata & {
  type: 'music.album'
  songs?: Array<string | URL | OGSong> | undefined
  musicians?: Array<string | URL> | undefined
  releaseDate?: string | undefined // datetime
}
type ResolvedOpenGraphMusicPlaylist = ResolvedOpenGraphMetadata & {
  type: 'music.playlist'
  songs?: Array<string | URL | OGSong> | undefined
  creators?: Array<string | URL> | undefined
}
type ResolvedOpenGraphRadioStation = ResolvedOpenGraphMetadata & {
  type: 'music.radio_station'
  creators?: Array<string | URL> | undefined
}
type ResolvedOpenGraphVideoMovie = ResolvedOpenGraphMetadata & {
  type: 'video.movie'
  actors?: Array<string | URL | OGActor> | undefined
  directors?: Array<string | URL> | undefined
  writers?: Array<string | URL> | undefined
  duration?: number | undefined
  releaseDate?: string | undefined // datetime
  tags?: Array<string> | undefined
}
type ResolvedOpenGraphVideoEpisode = ResolvedOpenGraphMetadata & {
  type: 'video.episode'
  actors?: Array<string | URL | OGActor> | undefined
  directors?: Array<string | URL> | undefined
  writers?: Array<string | URL> | undefined
  duration?: number | undefined
  releaseDate?: string | undefined // datetime
  tags?: Array<string> | undefined
  series?: string | URL | undefined
}
type ResolvedOpenGraphVideoTVShow = ResolvedOpenGraphMetadata & {
  type: 'video.tv_show'
}
type ResolvedOpenGraphVideoOther = ResolvedOpenGraphMetadata & {
  type: 'video.other'
}

type OGSong = {
  url: string | URL
  disc?: number | undefined
  track?: number | undefined
}
type OGAlbum = {
  url: string | URL
  disc?: number | undefined
  track?: number | undefined
}
type OGActor = {
  url: string | URL
  role?: string | undefined
}
