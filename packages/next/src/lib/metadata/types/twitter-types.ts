import type { AbsoluteTemplateString, TemplateString } from './metadata-types'

export type Twitter =
  | TwitterSummary
  | TwitterSummaryLargeImage
  | TwitterPlayer
  | TwitterApp
  | TwitterMetadata

type TwitterMetadata = {
  // defaults to card="summary"
  site?: string // username for account associated to the site itself
  siteId?: string // id for account associated to the site itself
  creator?: string // username for the account associated to the creator of the content on the site
  creatorId?: string // id for the account associated to the creator of the content on the site
  title?: string | TemplateString
  description?: string
  images?: TwitterImage | Array<TwitterImage>
}
type TwitterSummary = TwitterMetadata & {
  card: 'summary'
}
type TwitterSummaryLargeImage = TwitterMetadata & {
  card: 'summary_large_image'
}
type TwitterPlayer = TwitterMetadata & {
  card: 'player'
  players: TwitterPlayerDescriptor | Array<TwitterPlayerDescriptor>
}
type TwitterApp = TwitterMetadata & {
  card: 'app'
  app: TwitterAppDescriptor
}
type TwitterAppDescriptor = {
  id: {
    iphone?: string | number
    ipad?: string | number
    googleplay?: string
  }
  url?: {
    iphone?: string | URL
    ipad?: string | URL
    googleplay?: string | URL
  }
  country?: string
}

type TwitterImage = string | TwitterImageDescriptor | URL
type TwitterImageDescriptor = {
  url: string | URL
  secureUrl?: string | URL
  alt?: string
  type?: string
  width?: string | number
  height?: string | number
}
type TwitterPlayerDescriptor = {
  playerUrl: string | URL
  streamUrl: string | URL
  width: number
  height: number
}

export type ResolvedTwitterMetadata = Omit<TwitterMetadata, 'title'> & {
  title: AbsoluteTemplateString | null
}
