// Reference: https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/markup

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
  description?: string
  title?: string | TemplateString
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
export type TwitterAppDescriptor = {
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
  name?: string
}

type TwitterImage = string | TwitterImageDescriptor | URL
type TwitterImageDescriptor = {
  url: string | URL
  alt?: string
  secureUrl?: string | URL
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

type ResolvedTwitterImage = {
  url: string | URL
  alt?: string
  secureUrl?: string | URL
  type?: string
  width?: string | number
  height?: string | number
}
type ResolvedTwitterSummary = {
  site: string | null
  siteId: string | null
  creator: string | null
  creatorId: string | null
  description: string | null
  title: AbsoluteTemplateString
  images?: Array<ResolvedTwitterImage>
}
type ResolvedTwitterPlayer = ResolvedTwitterSummary & {
  players: Array<TwitterPlayerDescriptor>
}
type ResolvedTwitterApp = ResolvedTwitterSummary & { app: TwitterAppDescriptor }

export type ResolvedTwitterMetadata =
  | ({ card: 'summary' } & ResolvedTwitterSummary)
  | ({ card: 'summary_large_image' } & ResolvedTwitterSummary)
  | ({ card: 'player' } & ResolvedTwitterPlayer)
  | ({ card: 'app' } & ResolvedTwitterApp)
