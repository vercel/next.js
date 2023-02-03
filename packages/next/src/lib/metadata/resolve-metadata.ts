import type {
  Metadata,
  ResolvedMetadata,
  ResolvingMetadata,
} from './types/metadata-interface'
import type { Viewport } from './types/extra-types'
import type { ResolvedTwitterMetadata } from './types/twitter-types'
import type {
  AbsoluteTemplateString,
  Icon,
  IconDescriptor,
  Icons,
  ResolvedVerification,
} from './types/metadata-types'
import { createDefaultMetadata } from './default-metadata'
import { resolveOpenGraph } from './resolve-opengraph'
import { mergeTitle } from './resolve-title'
import { resolveAsArrayOrUndefined } from './generate/utils'
import { isClientReference } from '../../build/is-client-reference'

type FieldResolver<Key extends keyof Metadata> = (
  T: Metadata[Key]
) => ResolvedMetadata[Key]

const viewPortKeys = {
  width: 'width',
  height: 'height',
  initialScale: 'initial-scale',
  minimumScale: 'minimum-scale',
  maximumScale: 'maximum-scale',
  viewportFit: 'viewport-fit',
} as const

const resolveViewport: FieldResolver<'viewport'> = (viewport) => {
  let resolved: ResolvedMetadata['viewport'] = null

  if (typeof viewport === 'string') {
    resolved = viewport
  } else if (viewport) {
    resolved = ''
    for (const viewportKey_ in viewPortKeys) {
      const viewportKey = viewportKey_ as keyof Viewport
      if (viewport[viewportKey]) {
        if (resolved) resolved += ', '
        resolved += `${viewPortKeys[viewportKey]}=${viewport[viewportKey]}`
      }
    }
  }
  return resolved
}

const VerificationKeys = ['google', 'yahoo', 'yandex', 'me', 'other'] as const
const resolveVerification: FieldResolver<'verification'> = (verification) => {
  if (!verification) return null
  const res = {} as ResolvedVerification

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

function isStringOrURL(icon: any): icon is string | URL {
  return typeof icon === 'string' || icon instanceof URL
}

function resolveIcon(icon: Icon): IconDescriptor {
  if (isStringOrURL(icon)) return { url: icon }
  else if (Array.isArray(icon)) return icon
  return icon
}

const IconKeys = ['icon', 'shortcut', 'apple', 'other'] as (keyof Icons)[]
const TwitterBasicInfoKeys = [
  'site',
  'siteId',
  'creator',
  'creatorId',
  'description',
] as const

const resolveIcons: FieldResolver<'icons'> = (icons) => {
  if (!icons) {
    return null
  }

  const resolved: ResolvedMetadata['icons'] = {}
  if (Array.isArray(icons)) {
    resolved.icon = icons.map(resolveIcon).filter(Boolean)
  } else if (isStringOrURL(icons)) {
    resolved.icon = [resolveIcon(icons)]
  } else {
    for (const key of IconKeys) {
      const values = resolveAsArrayOrUndefined(icons[key])
      if (values) resolved[key] = values.map(resolveIcon)
    }
  }
  return resolved
}

const resolveAppleWebApp: FieldResolver<'appleWebApp'> = (appWebApp) => {
  if (!appWebApp) return null
  if (appWebApp === true) {
    return {
      capable: true,
    }
  }

  const startupImages = resolveAsArrayOrUndefined(appWebApp.startupImage)?.map(
    (item) => (typeof item === 'string' ? { url: item } : item)
  )

  return {
    capable: 'capable' in appWebApp ? !!appWebApp.capable : true,
    title: appWebApp.title || null,
    startupImage: startupImages || null,
    statusBarStyle: appWebApp.statusBarStyle || 'default',
  }
}

const resolveTwitter: FieldResolver<'twitter'> = (twitter) => {
  if (!twitter) return null
  const resolved = {
    title: twitter.title,
  } as ResolvedTwitterMetadata
  for (const infoKey of TwitterBasicInfoKeys) {
    resolved[infoKey] = twitter[infoKey] || null
  }
  resolved.images = resolveAsArrayOrUndefined(twitter.images)?.map((item) => {
    if (isStringOrURL(item))
      return {
        url: item.toString(),
      }
    else {
      return {
        url: item.url.toString(),
        alt: item.alt,
      }
    }
  })
  if ('card' in twitter) {
    resolved.card = twitter.card
    switch (twitter.card) {
      case 'player': {
        // @ts-ignore
        resolved.players = resolveAsArrayOrUndefined(twitter.players) || []
        break
      }
      case 'app': {
        // @ts-ignore
        resolved.app = twitter.app || {}
        break
      }
      default:
        break
    }
  } else {
    resolved.card = 'summary'
  }
  return resolved
}

const resolveAppLinks: FieldResolver<'appLinks'> = (appLinks) => {
  if (!appLinks) return null
  for (const key in appLinks) {
    // @ts-ignore // TODO: type infer
    appLinks[key] = resolveAsArrayOrUndefined(appLinks[key])
  }
  return appLinks as ResolvedMetadata['appLinks']
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

const resolveRobots: FieldResolver<'robots'> = (robots) => {
  if (!robots) return null
  return {
    basic: resolveRobotsValue(robots),
    googleBot:
      typeof robots !== 'string' ? resolveRobotsValue(robots.googleBot) : null,
  }
}

// Merge the source metadata into the resolved target metadata.
function merge(
  target: ResolvedMetadata,
  source: Metadata,
  templateStrings: {
    title: string | null
    openGraph: string | null
    twitter: string | null
  }
) {
  for (const key_ in source) {
    const key = key_ as keyof Metadata

    switch (key) {
      case 'title': {
        if (source.title) {
          target.title = source.title as AbsoluteTemplateString
          mergeTitle(target, templateStrings.title)
        }
        break
      }
      case 'openGraph': {
        if (typeof source.openGraph !== 'undefined') {
          target.openGraph = resolveOpenGraph(source.openGraph)
          if (source.openGraph) {
            mergeTitle(target.openGraph, templateStrings.openGraph)
          }
        } else {
          target.openGraph = null
        }
        break
      }
      case 'twitter': {
        target.twitter = resolveTwitter(source.twitter)
        if (target.twitter) {
          mergeTitle(target.twitter, templateStrings.twitter)
        }
        break
      }
      case 'verification':
        target.verification = resolveVerification(source.verification)
        break
      case 'viewport': {
        target.viewport = resolveViewport(source.viewport)
        break
      }
      case 'icons': {
        target.icons = resolveIcons(source.icons)
        break
      }
      case 'appleWebApp':
        target.appleWebApp = resolveAppleWebApp(source.appleWebApp)
        break
      case 'appLinks':
        target.appLinks = resolveAppLinks(source.appLinks)
        break
      case 'robots': {
        target.robots = resolveRobots(source.robots)
        break
      }
      case 'archives':
      case 'assets':
      case 'bookmarks':
      case 'keywords':
      case 'authors': {
        // FIXME: type inferring
        // @ts-ignore
        target[key] = resolveAsArrayOrUndefined(source[key]) || null
        break
      }
      // directly assign fields that fallback to null
      case 'applicationName':
      case 'description':
      case 'generator':
      case 'themeColor':
      case 'creator':
      case 'publisher':
      case 'category':
      case 'classification':
      case 'referrer':
      case 'colorScheme':
      case 'itunes':
      case 'alternates':
      case 'formatDetection':
        // @ts-ignore TODO: support inferring
        target[key] = source[key] || null
        break
      case 'other':
        target.other = Object.assign({}, target.other, source.other)
        break
      default:
        break
    }
  }
}

type MetadataResolver = (_parent: ResolvingMetadata) => Promise<Metadata>
export type MetadataItems = (Metadata | MetadataResolver)[]

async function getDefinedMetadata(
  mod: any,
  props: any
): Promise<Metadata | MetadataResolver | null> {
  // Layer is a client component, we just skip it. It can't have metadata
  // exported. Note that during our SWC transpilation, it should check if
  // the exports are valid and give specific error messages.
  if (isClientReference(mod)) {
    return null
  }

  if (mod.metadata && mod.generateMetadata) {
    throw new Error(
      `${mod.path} is exporting both metadata and generateMetadata which is not supported. If all of the metadata you want to associate to this page/layout is static use the metadata export, otherwise use generateMetadata. File: ${mod.path}`
    )
  }

  return mod.generateMetadata
    ? (parent: ResolvingMetadata) => mod.generateMetadata(props, parent)
    : mod.metadata
}

// layout.metadata -> layout.metadata -> page.metadata
export async function collectMetadata(
  mod: any,
  props: any,
  array: MetadataItems
) {
  if (!mod) return
  const metadata = await getDefinedMetadata(mod, props)
  if (metadata) {
    array.push(metadata)
  }
}

export async function accumulateMetadata(
  metadataItems: MetadataItems
): Promise<ResolvedMetadata> {
  const resolvedMetadata = createDefaultMetadata()
  let parentPromise = Promise.resolve(resolvedMetadata)

  for (const item of metadataItems) {
    const layerMetadataPromise =
      typeof item === 'function' ? item(parentPromise) : Promise.resolve(item)
    parentPromise = parentPromise.then((resolved) => {
      return layerMetadataPromise.then((metadata) => {
        merge(resolved, metadata, {
          title: resolved.title?.template || null,
          openGraph: resolved.openGraph?.title?.template || null,
          twitter: resolved.twitter?.title?.template || null,
        })
        return resolved
      })
    })
  }
  return await parentPromise
}

// TODO: Implement this function.
export async function resolveFileBasedMetadataForLoader(
  _layer: number,
  _dir: string
) {
  let metadataCode = ''

  // const files = await fs.readdir(path.normalize(dir))
  // for (const file of files) {
  //   // TODO: Get a full list and filter out directories.
  //   if (file === 'icon.svg') {
  //     metadataCode += `{
  //       type: 'icon',
  //       layer: ${layer},
  //       path: ${JSON.stringify(path.join(dir, file))},
  //     },`
  //   } else if (file === 'icon.jsx') {
  //     metadataCode += `{
  //       type: 'icon',
  //       layer: ${layer},
  //       mod: () => import(/* webpackMode: "eager" */ ${JSON.stringify(
  //         path.join(dir, file)
  //       )}),
  //       path: ${JSON.stringify(path.join(dir, file))},
  //     },`
  //   }
  // }

  return metadataCode
}
