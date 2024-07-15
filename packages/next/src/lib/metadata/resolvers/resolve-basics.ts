import type {
  AlternateLinkDescriptor,
  ResolvedAlternateURLs,
} from '../types/alternative-urls-types'
import type {
  Metadata,
  ResolvedMetadata,
  Viewport,
} from '../types/metadata-interface'
import type { ResolvedVerification } from '../types/metadata-types'
import type {
  FieldResolver,
  FieldResolverExtraArgs,
  MetadataContext,
} from '../types/resolvers'
import { resolveAsArrayOrUndefined } from '../generate/utils'
import { resolveAbsoluteUrlWithPathname } from './resolve-url'

function resolveAlternateUrl(
  url: string | URL,
  metadataBase: URL | null,
  metadataContext: MetadataContext
) {
  // If alter native url is an URL instance,
  // we treat it as a URL base and resolve with current pathname
  if (url instanceof URL) {
    url = new URL(metadataContext.pathname, url)
  }
  return resolveAbsoluteUrlWithPathname(url, metadataBase, metadataContext)
}

export const resolveThemeColor: FieldResolver<'themeColor', Viewport> = (
  themeColor
) => {
  if (!themeColor) return null
  const themeColorDescriptors: Viewport['themeColor'] = []

  resolveAsArrayOrUndefined(themeColor)?.forEach((descriptor) => {
    if (typeof descriptor === 'string')
      themeColorDescriptors.push({ color: descriptor })
    else if (typeof descriptor === 'object')
      themeColorDescriptors.push({
        color: descriptor.color,
        media: descriptor.media,
      })
  })

  return themeColorDescriptors
}

function resolveUrlValuesOfObject(
  obj:
    | Record<
        string,
        string | URL | AlternateLinkDescriptor[] | null | undefined
      >
    | null
    | undefined,
  metadataBase: ResolvedMetadata['metadataBase'],
  metadataContext: MetadataContext
): null | Record<string, AlternateLinkDescriptor[]> {
  if (!obj) return null

  const result: Record<string, AlternateLinkDescriptor[]> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' || value instanceof URL) {
      result[key] = [
        {
          url: resolveAlternateUrl(value, metadataBase, metadataContext),
        },
      ]
    } else {
      result[key] = []
      value?.forEach((item, index) => {
        const url = resolveAlternateUrl(item.url, metadataBase, metadataContext)
        result[key][index] = {
          url,
          title: item.title,
        }
      })
    }
  }
  return result
}

function resolveCanonicalUrl(
  urlOrDescriptor: string | URL | null | AlternateLinkDescriptor | undefined,
  metadataBase: URL | null,
  metadataContext: MetadataContext
): null | AlternateLinkDescriptor {
  if (!urlOrDescriptor) return null

  const url =
    typeof urlOrDescriptor === 'string' || urlOrDescriptor instanceof URL
      ? urlOrDescriptor
      : urlOrDescriptor.url

  // Return string url because structureClone can't handle URL instance
  return {
    url: resolveAlternateUrl(url, metadataBase, metadataContext),
  }
}

export const resolveAlternates: FieldResolverExtraArgs<
  'alternates',
  [ResolvedMetadata['metadataBase'], MetadataContext]
> = (alternates, metadataBase, context) => {
  if (!alternates) return null

  const canonical = resolveCanonicalUrl(
    alternates.canonical,
    metadataBase,
    context
  )
  const languages = resolveUrlValuesOfObject(
    alternates.languages,
    metadataBase,
    context
  )
  const media = resolveUrlValuesOfObject(
    alternates.media,
    metadataBase,
    context
  )
  const types = resolveUrlValuesOfObject(
    alternates.types,
    metadataBase,
    context
  )

  const result: ResolvedAlternateURLs = {
    canonical,
    languages,
    media,
    types,
  }

  return result
}

const robotsKeys = [
  'noarchive',
  'nosnippet',
  'noimageindex',
  'nocache',
  'notranslate',
  'indexifembedded',
  'nositelinkssearchbox',
  'unavailable_after',
  'max-video-preview',
  'max-image-preview',
  'max-snippet',
] as const
const resolveRobotsValue: (robots: Metadata['robots']) => string | null = (
  robots
) => {
  if (!robots) return null
  if (typeof robots === 'string') return robots

  const values: string[] = []

  if (robots.index) values.push('index')
  else if (typeof robots.index === 'boolean') values.push('noindex')

  if (robots.follow) values.push('follow')
  else if (typeof robots.follow === 'boolean') values.push('nofollow')

  for (const key of robotsKeys) {
    const value = robots[key]
    if (typeof value !== 'undefined' && value !== false) {
      values.push(typeof value === 'boolean' ? key : `${key}:${value}`)
    }
  }

  return values.join(', ')
}

export const resolveRobots: FieldResolver<'robots'> = (robots) => {
  if (!robots) return null
  return {
    basic: resolveRobotsValue(robots),
    googleBot:
      typeof robots !== 'string' ? resolveRobotsValue(robots.googleBot) : null,
  }
}

const VerificationKeys = ['google', 'yahoo', 'yandex', 'me', 'other'] as const
export const resolveVerification: FieldResolver<'verification'> = (
  verification
) => {
  if (!verification) return null
  const res: ResolvedVerification = {}

  for (const key of VerificationKeys) {
    const value = verification[key]
    if (value) {
      if (key === 'other') {
        res.other = {}
        for (const otherKey in verification.other) {
          const otherValue = resolveAsArrayOrUndefined(
            verification.other[otherKey]
          )
          if (otherValue) res.other[otherKey] = otherValue
        }
      } else res[key] = resolveAsArrayOrUndefined(value) as (string | number)[]
    }
  }
  return res
}

export const resolveAppleWebApp: FieldResolver<'appleWebApp'> = (appWebApp) => {
  if (!appWebApp) return null
  if (appWebApp === true) {
    return {
      capable: true,
    }
  }

  const startupImages = appWebApp.startupImage
    ? resolveAsArrayOrUndefined(appWebApp.startupImage)?.map((item) =>
        typeof item === 'string' ? { url: item } : item
      )
    : null

  return {
    capable: 'capable' in appWebApp ? !!appWebApp.capable : true,
    title: appWebApp.title || null,
    startupImage: startupImages,
    statusBarStyle: appWebApp.statusBarStyle || 'default',
  }
}

export const resolveAppLinks: FieldResolver<'appLinks'> = (appLinks) => {
  if (!appLinks) return null
  for (const key in appLinks) {
    // @ts-ignore // TODO: type infer
    appLinks[key] = resolveAsArrayOrUndefined(appLinks[key])
  }
  return appLinks as ResolvedMetadata['appLinks']
}

export const resolveItunes: FieldResolverExtraArgs<
  'itunes',
  [ResolvedMetadata['metadataBase'], MetadataContext]
> = (itunes, metadataBase, context) => {
  if (!itunes) return null
  return {
    appId: itunes.appId,
    appArgument: itunes.appArgument
      ? resolveAlternateUrl(itunes.appArgument, metadataBase, context)
      : undefined,
  }
}

export const resolveFacebook: FieldResolver<'facebook'> = (facebook) => {
  if (!facebook) return null
  return {
    appId: facebook.appId,
    admins: resolveAsArrayOrUndefined(facebook.admins),
  }
}
