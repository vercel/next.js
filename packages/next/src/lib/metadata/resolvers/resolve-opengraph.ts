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
import { isFullStringUrl } from '../../url'
import { warnOnce } from '../../../build/output/log'

type FlattenArray<T> = T extends (infer U)[] ? U : T
type ResolvedMetadataBase = ResolvedMetadata['metadataBase']

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

function resolveAndValidateImage(
  item: FlattenArray<OpenGraph['images'] | Twitter['images']>,
  metadataBase: NonNullable<ResolvedMetadataBase>,
  isMetadataBaseMissing: boolean
) {
  if (!item) return undefined
  const isItemUrl = isStringOrURL(item)
  const inputUrl = isItemUrl ? item : item.url
  if (!inputUrl) return undefined

  validateResolvedImageUrl(inputUrl, metadataBase, isMetadataBaseMissing)

  return isItemUrl
    ? {
        url: resolveUrl(inputUrl, metadataBase),
      }
    : {
        ...item,
        // Update image descriptor url
        url: resolveUrl(inputUrl, metadataBase),
      }
}

export function resolveImages(
  images: Twitter['images'],
  metadataBase: ResolvedMetadataBase
): NonNullable<ResolvedMetadata['twitter']>['images']
export function resolveImages(
  images: OpenGraph['images'],
  metadataBase: ResolvedMetadataBase
): NonNullable<ResolvedMetadata['openGraph']>['images']
export function resolveImages(
  images: OpenGraph['images'] | Twitter['images'],
  metadataBase: ResolvedMetadataBase
):
  | NonNullable<ResolvedMetadata['twitter']>['images']
  | NonNullable<ResolvedMetadata['openGraph']>['images'] {
  const resolvedImages = resolveAsArrayOrUndefined(images)
  if (!resolvedImages) return resolvedImages

  const { isMetadataBaseMissing, fallbackMetadataBase } =
    getSocialImageFallbackMetadataBase(metadataBase)
  const nonNullableImages = []
  for (const item of resolvedImages) {
    const resolvedItem = resolveAndValidateImage(
      item,
      fallbackMetadataBase,
      isMetadataBaseMissing
    )
    if (!resolvedItem) continue

    nonNullableImages.push(resolvedItem)
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

function validateResolvedImageUrl(
  inputUrl: string | URL,
  fallbackMetadataBase: NonNullable<ResolvedMetadataBase>,
  isMetadataBaseMissing: boolean
): void {
  // Only warn on the image url that needs to be resolved with metadataBase
  if (
    typeof inputUrl === 'string' &&
    !isFullStringUrl(inputUrl) &&
    isMetadataBaseMissing
  ) {
    warnOnce(
      `metadataBase property in metadata export is not set for resolving social open graph or twitter images, using "${fallbackMetadataBase.origin}". See https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase`
    )
  }
}

export const resolveOpenGraph: FieldResolverExtraArgs<
  'openGraph',
  [ResolvedMetadataBase, MetadataContext, string | null]
> = (openGraph, metadataBase, metadataContext, titleTemplate) => {
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
    target.images = resolveImages(og.images, metadataBase)
  }

  const resolved = {
    ...openGraph,
    title: resolveTitle(openGraph.title, titleTemplate),
  } as ResolvedOpenGraph
  resolveProps(resolved, openGraph)

  resolved.url = openGraph.url
    ? resolveAbsoluteUrlWithPathname(
        openGraph.url,
        metadataBase,
        metadataContext
      )
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
  [ResolvedMetadataBase, string | null]
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

  resolved.images = resolveImages(twitter.images, metadataBase)

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
