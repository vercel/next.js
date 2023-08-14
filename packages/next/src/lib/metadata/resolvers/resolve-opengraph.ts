import type { ResolvedMetadata } from '../types/metadata-interface'
import type {
  OpenGraphType,
  OpenGraph,
  ResolvedOpenGraph,
} from '../types/opengraph-types'
import type {
  FieldResolverExtraArgs,
  MetadataContext,
} from '../types/resolvers'
import type { ResolvedTwitterMetadata, Twitter } from '../types/twitter-types'
import { resolveAsArrayOrUndefined } from '../generate/utils'
import {
  getSocialImageFallbackMetadataBase,
  isStringOrURL,
  resolveUrl,
  resolveAbsoluteUrlWithPathname,
} from './resolve-url'
import { resolveTitle } from './resolve-title'

const OgTypeFields = {
  article: ['authors', 'tags'],
  song: ['albums', 'musicians'],
  playlist: ['albums', 'musicians'],
  radio: ['creators'],
  video: ['actors', 'directors', 'writers', 'tags'],
  basic: [
    'emails',
    'phoneNumbers',
    'faxNumbers',
    'alternateLocale',
    'audio',
    'videos',
  ],
} as const

export function resolveImages(
  images: Twitter['images'],
  metadataBase: ResolvedMetadata['metadataBase']
): NonNullable<ResolvedMetadata['twitter']>['images']
export function resolveImages(
  images: OpenGraph['images'],
  metadataBase: ResolvedMetadata['metadataBase']
): NonNullable<ResolvedMetadata['openGraph']>['images']
export function resolveImages(
  images: OpenGraph['images'] | Twitter['images'],
  metadataBase: ResolvedMetadata['metadataBase']
):
  | NonNullable<ResolvedMetadata['twitter']>['images']
  | NonNullable<ResolvedMetadata['openGraph']>['images'] {
  const resolvedImages = resolveAsArrayOrUndefined(images)
  if (!resolvedImages) return resolvedImages

  const nonNullableImages = []
  for (const item of resolvedImages) {
    if (!item) continue
    const isItemUrl = isStringOrURL(item)
    const inputUrl = isItemUrl ? item : item.url
    if (!inputUrl) continue

    nonNullableImages.push(
      isItemUrl
        ? {
            url: resolveUrl(item, metadataBase),
          }
        : {
            ...item,
            // Update image descriptor url
            url: resolveUrl(item.url, metadataBase),
          }
    )
  }

  return nonNullableImages
}

function getFieldsByOgType(ogType: OpenGraphType | undefined) {
  switch (ogType) {
    case 'article':
    case 'book':
      return OgTypeFields.article
    case 'music.song':
    case 'music.album':
      return OgTypeFields.song
    case 'music.playlist':
      return OgTypeFields.playlist
    case 'music.radio_station':
      return OgTypeFields.radio
    case 'video.movie':
    case 'video.episode':
      return OgTypeFields.video
    default:
      return OgTypeFields.basic
  }
}

export const resolveOpenGraph: FieldResolverExtraArgs<
  'openGraph',
  [ResolvedMetadata['metadataBase'], MetadataContext, string | null]
> = (openGraph, metadataBase, { pathname }, titleTemplate) => {
  if (!openGraph) return null

  function resolveProps(target: ResolvedOpenGraph, og: OpenGraph) {
    const ogType = og && 'type' in og ? og.type : undefined
    const keys = getFieldsByOgType(ogType)
    for (const k of keys) {
      const key = k as keyof ResolvedOpenGraph
      if (key in og && key !== 'url') {
        const value = og[key]
        if (value) {
          const arrayValue = resolveAsArrayOrUndefined(value)
          /// TODO: improve typing inferring
          ;(target as any)[key] = arrayValue
        }
      }
    }

    const imageMetadataBase = getSocialImageFallbackMetadataBase(metadataBase)
    target.images = resolveImages(og.images, imageMetadataBase)
  }

  const resolved = {
    ...openGraph,
    title: resolveTitle(openGraph.title, titleTemplate),
  } as ResolvedOpenGraph
  resolveProps(resolved, openGraph)

  resolved.url = openGraph.url
    ? resolveAbsoluteUrlWithPathname(openGraph.url, metadataBase, pathname)
    : null

  return resolved
}

const TwitterBasicInfoKeys = [
  'site',
  'siteId',
  'creator',
  'creatorId',
  'description',
] as const

export const resolveTwitter: FieldResolverExtraArgs<
  'twitter',
  [ResolvedMetadata['metadataBase'], string | null]
> = (twitter, metadataBase, titleTemplate) => {
  if (!twitter) return null
  let card = 'card' in twitter ? twitter.card : undefined
  const resolved = {
    ...twitter,
    title: resolveTitle(twitter.title, titleTemplate),
  } as ResolvedTwitterMetadata
  for (const infoKey of TwitterBasicInfoKeys) {
    resolved[infoKey] = twitter[infoKey] || null
  }
  const imageMetadataBase = getSocialImageFallbackMetadataBase(metadataBase)
  resolved.images = resolveImages(twitter.images, imageMetadataBase)

  card = card || (resolved.images?.length ? 'summary_large_image' : 'summary')
  resolved.card = card

  if ('card' in resolved) {
    switch (resolved.card) {
      case 'player': {
        resolved.players = resolveAsArrayOrUndefined(resolved.players) || []
        break
      }
      case 'app': {
        resolved.app = resolved.app || {}
        break
      }
      default:
        break
    }
  }

  return resolved
}
