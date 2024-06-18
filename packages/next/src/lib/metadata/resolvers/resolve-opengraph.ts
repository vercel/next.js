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
  isMetadataBaseMissing: boolean,
  isStandaloneMode: boolean
) {
  if (!item) return undefined
  const isItemUrl = isStringOrURL(item)
  const inputUrl = isItemUrl ? item : item.url
  if (!inputUrl) return undefined

  const isNonVercelDeployment =
    !process.env.VERCEL && process.env.NODE_ENV === 'production'
  // Validate url in self-host standalone mode or non-Vercel deployment
  if (isStandaloneMode || isNonVercelDeployment) {
    validateResolvedImageUrl(inputUrl, metadataBase, isMetadataBaseMissing)
  }

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
  metadataBase: ResolvedMetadataBase,
  isStandaloneMode: boolean
): NonNullable<ResolvedMetadata['twitter']>['images']
export function resolveImages(
  images: OpenGraph['images'],
  metadataBase: ResolvedMetadataBase,
  isStandaloneMode: boolean
): NonNullable<ResolvedMetadata['openGraph']>['images']
export function resolveImages(
  images: OpenGraph['images'] | Twitter['images'],
  metadataBase: ResolvedMetadataBase,
  isStandaloneMode: boolean
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
      isMetadataBaseMissing,
      isStandaloneMode
    )
    if (!resolvedItem) continue

    nonNullableImages.push(resolvedItem)
  }

  return nonNullableImages
}

const ogTypeToFields: Record<string, readonly string[]> = {
  article: OgTypeFields.article,
  book: OgTypeFields.article,
  'music.song': OgTypeFields.song,
  'music.album': OgTypeFields.song,
  'music.playlist': OgTypeFields.playlist,
  'music.radio_station': OgTypeFields.radio,
  'video.movie': OgTypeFields.video,
  'video.episode': OgTypeFields.video,
}

function getFieldsByOgType(ogType: OpenGraphType | undefined) {
  if (!ogType || !(ogType in ogTypeToFields)) return OgTypeFields.basic
  return ogTypeToFields[ogType].concat(OgTypeFields.basic)
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
    target.images = resolveImages(
      og.images,
      metadataBase,
      metadataContext.isStandaloneMode
    )
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
  [ResolvedMetadataBase, MetadataContext, string | null]
> = (twitter, metadataBase, metadataContext, titleTemplate) => {
  if (!twitter) return null
  let card = 'card' in twitter ? twitter.card : undefined
  const resolved = {
    ...twitter,
    title: resolveTitle(twitter.title, titleTemplate),
  } as ResolvedTwitterMetadata
  for (const infoKey of TwitterBasicInfoKeys) {
    resolved[infoKey] = twitter[infoKey] || null
  }

  resolved.images = resolveImages(
    twitter.images,
    metadataBase,
    metadataContext.isStandaloneMode
  )

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
