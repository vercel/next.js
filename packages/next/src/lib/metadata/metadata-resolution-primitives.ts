import type {
  Metadata,
  ResolvedMetadata,
  ResolvedViewport,
  ResolvingMetadata,
  ResolvingViewport,
  Viewport,
  WithStringifiedURLs,
} from './types/metadata-interface'
import type { MetadataImageModule } from '../../build/webpack/loaders/metadata/types'
import type { Twitter } from './types/twitter-types'
import type { OpenGraph } from './types/opengraph-types'
import type { AppDirModules } from '../../build/webpack/loaders/next-app-loader'
import type { MetadataContext } from './types/resolvers'
import type {
  AbsoluteTemplateString,
  IconDescriptor,
  ResolvedIcons,
} from './types/metadata-types'
import type { StaticMetadata } from './types/icons'
import type { Params } from '../../server/request/params'
import type { SearchParams } from '../../server/request/search-params'

// eslint-disable-next-line import/no-extraneous-dependencies
import 'server-only'

import { resolveOpenGraph, resolveTwitter } from './resolvers/resolve-opengraph'
import { resolveTitle } from './resolvers/resolve-title'
import { resolveAsArrayOrUndefined } from './generate/utils'
import {
  resolveAlternates,
  resolveAppleWebApp,
  resolveAppLinks,
  resolveRobots,
  resolveThemeColor,
  resolveVerification,
  resolveItunes,
  resolveFacebook,
  resolvePagination,
} from './resolvers/resolve-basics'
import { resolveIcons } from './resolvers/resolve-icons'
import { getTracer } from '../../server/lib/trace/tracer'
import { ResolveMetadataSpan } from '../../server/lib/trace/constants'
import type { MetadataBaseURL } from './resolvers/resolve-url'
import { isUseCacheFunction } from '../client-and-server-references'
import type {
  UseCacheLayoutProps,
  UseCachePageProps,
} from '../../server/use-cache/use-cache-wrapper'

export type StaticIcons = Pick<ResolvedIcons, 'icon' | 'apple'>

export type InstrumentedResolver<TData, TResolved> = ((
  parent: Promise<TResolved>
) => TData | Promise<TData>) & {
  $$original: (
    props: unknown,
    parent: Promise<TResolved>
  ) => TData | Promise<TData>
}
export type MetadataResolver = InstrumentedResolver<Metadata, ResolvedMetadata>
export type ViewportResolver = InstrumentedResolver<Viewport, ResolvedViewport>

export type MetadataErrorType = 'not-found' | 'forbidden' | 'unauthorized'

export type MetadataItems = Array<
  [Metadata | MetadataResolver | null, StaticMetadata]
>

export type ViewportItems = Array<Viewport | ViewportResolver | null>

type WithSelectedTitle<T> = T extends { title: AbsoluteTemplateString }
  ? Omit<T, 'title'> & { title: string }
  : T

/**
 * Metadata that has finished route-level resolution and post-processing. It
 * contains only values that can be turned into metadata elements; it is never
 * used as the parent of another metadata resolver.
 */
export type SelectedMetadata = Omit<
  ResolvedMetadata,
  | 'metadataBase'
  | 'title'
  | 'openGraph'
  | 'twitter'
  | 'themeColor'
  | 'colorScheme'
  | 'viewport'
> & {
  title: string | null
  openGraph: WithSelectedTitle<
    NonNullable<ResolvedMetadata['openGraph']>
  > | null
  twitter: WithSelectedTitle<NonNullable<ResolvedMetadata['twitter']>> | null
}

export type TitleTemplates = {
  title: string | null
  twitter: string | null
  openGraph: string | null
}

export type BuildState = {
  warnings: Set<string>
}

export type LayoutProps = {
  params: Promise<Params>
}

export type PageProps = {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}

export type SegmentProps = LayoutProps | PageProps
export type UseCacheSegmentProps = UseCacheLayoutProps | UseCachePageProps

export function isFavicon(icon: IconDescriptor | undefined): boolean {
  if (!icon) {
    return false
  }

  // turbopack appends a hash to all images
  return (
    (icon.url === '/favicon.ico' ||
      icon.url.toString().startsWith('/favicon.ico?')) &&
    icon.type === 'image/x-icon'
  )
}

export function convertUrlsToStrings<T>(input: T): WithStringifiedURLs<T> {
  if (input instanceof URL) {
    return input.toString() as unknown as WithStringifiedURLs<T>
  } else if (Array.isArray(input)) {
    return input.map((item) =>
      convertUrlsToStrings(item)
    ) as WithStringifiedURLs<T>
  } else if (input && typeof input === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input)) {
      result[key] = convertUrlsToStrings(value)
    }
    return result as WithStringifiedURLs<T>
  }
  return input as WithStringifiedURLs<T>
}

function normalizeMetadataBase(metadataBase: string | URL | null): URL | null {
  if (typeof metadataBase === 'string') {
    try {
      metadataBase = new URL(metadataBase)
    } catch {
      throw new Error(`metadataBase is not a valid URL: ${metadataBase}`)
    }
  }
  return metadataBase
}

async function mergeStaticMetadata(
  metadataBase: MetadataBaseURL,
  source: Metadata | null,
  target: ResolvedMetadata,
  staticFilesMetadata: StaticMetadata,
  metadataContext: MetadataContext,
  titleTemplates: TitleTemplates,
  leafSegmentStaticIcons: StaticIcons,
  pathname: Promise<string>
): Promise<ResolvedMetadata> {
  if (!staticFilesMetadata) return target
  const { icon, apple, openGraph, twitter, manifest } = staticFilesMetadata

  // Keep updating the static icons in the most leaf node

  if (icon) {
    leafSegmentStaticIcons.icon = icon
  }
  if (apple) {
    leafSegmentStaticIcons.apple = apple
  }

  // file based metadata is specified and current level metadata twitter.images is not specified
  if (twitter && !source?.twitter?.hasOwnProperty('images')) {
    const resolvedTwitter = resolveTwitter(
      { ...target.twitter, images: twitter } as Twitter,
      metadataBase,
      { ...metadataContext, isStaticMetadataRouteFile: true },
      titleTemplates.twitter
    )
    target.twitter = convertUrlsToStrings(resolvedTwitter)
  }

  // file based metadata is specified and current level metadata openGraph.images is not specified
  if (openGraph && !source?.openGraph?.hasOwnProperty('images')) {
    const resolvedOpenGraph = await resolveOpenGraph(
      { ...target.openGraph, images: openGraph } as OpenGraph,
      metadataBase,
      pathname,
      { ...metadataContext, isStaticMetadataRouteFile: true },
      titleTemplates.openGraph
    )
    target.openGraph = convertUrlsToStrings(resolvedOpenGraph)
  }
  if (manifest) {
    target.manifest = manifest
  }

  return target
}

/**
 * Merges the given metadata with the resolved metadata. Returns a new object.
 */
export async function mergeMetadata(
  route: string,
  pathname: Promise<string>,
  {
    metadata,
    resolvedMetadata,
    staticFilesMetadata,
    titleTemplates,
    metadataContext,
    buildState,
    leafSegmentStaticIcons,
  }: {
    metadata: Metadata | null
    resolvedMetadata: ResolvedMetadata
    staticFilesMetadata: StaticMetadata
    titleTemplates: TitleTemplates
    metadataContext: MetadataContext
    buildState: BuildState
    leafSegmentStaticIcons: StaticIcons
  },
  cloneResolvedMetadata = true
): Promise<ResolvedMetadata> {
  const newResolvedMetadata = cloneResolvedMetadata
    ? structuredClone(resolvedMetadata)
    : resolvedMetadata

  const metadataBase = normalizeMetadataBase(
    metadata?.metadataBase !== undefined
      ? metadata.metadataBase
      : resolvedMetadata.metadataBase
  )

  for (const key_ in metadata) {
    const key = key_ as keyof Metadata

    switch (key) {
      case 'title': {
        newResolvedMetadata.title = resolveTitle(
          metadata.title,
          titleTemplates.title
        )
        break
      }
      case 'alternates': {
        newResolvedMetadata.alternates = convertUrlsToStrings(
          await resolveAlternates(
            metadata.alternates,
            metadataBase,
            pathname,
            metadataContext
          )
        )
        break
      }
      case 'openGraph': {
        newResolvedMetadata.openGraph = convertUrlsToStrings(
          await resolveOpenGraph(
            metadata.openGraph,
            metadataBase,
            pathname,
            metadataContext,
            titleTemplates.openGraph
          )
        )
        break
      }
      case 'twitter': {
        newResolvedMetadata.twitter = convertUrlsToStrings(
          resolveTwitter(
            metadata.twitter,
            metadataBase,
            metadataContext,
            titleTemplates.twitter
          )
        )
        break
      }
      case 'facebook':
        newResolvedMetadata.facebook = resolveFacebook(metadata.facebook)
        break
      case 'verification':
        newResolvedMetadata.verification = resolveVerification(
          metadata.verification
        )
        break

      case 'icons': {
        newResolvedMetadata.icons = convertUrlsToStrings(
          resolveIcons(metadata.icons)
        )
        break
      }
      case 'appleWebApp':
        newResolvedMetadata.appleWebApp = resolveAppleWebApp(
          metadata.appleWebApp
        )
        break
      case 'appLinks':
        newResolvedMetadata.appLinks = convertUrlsToStrings(
          resolveAppLinks(metadata.appLinks)
        )
        break
      case 'robots': {
        newResolvedMetadata.robots = resolveRobots(metadata.robots)
        break
      }
      case 'archives':
      case 'assets':
      case 'bookmarks':
      case 'keywords': {
        newResolvedMetadata[key] = resolveAsArrayOrUndefined(metadata[key])
        break
      }
      case 'authors': {
        newResolvedMetadata[key] = convertUrlsToStrings(
          resolveAsArrayOrUndefined(metadata.authors)
        )
        break
      }
      case 'itunes': {
        newResolvedMetadata[key] = await resolveItunes(
          metadata.itunes,
          metadataBase,
          pathname,
          metadataContext
        )
        break
      }
      case 'pagination': {
        newResolvedMetadata.pagination = await resolvePagination(
          metadata.pagination,
          metadataBase,
          pathname,
          metadataContext
        )
        break
      }
      // directly assign fields that fallback to null
      case 'abstract':
        newResolvedMetadata[key] = metadata[key] ?? null
        break
      case 'applicationName':
        newResolvedMetadata[key] = metadata[key] ?? null
        break
      case 'description':
        newResolvedMetadata[key] = metadata[key] ?? null
        break
      case 'generator':
        newResolvedMetadata[key] = metadata[key] ?? null
        break
      case 'creator':
        newResolvedMetadata[key] = metadata[key] ?? null
        break
      case 'publisher':
        newResolvedMetadata[key] = metadata[key] ?? null
        break
      case 'category':
        newResolvedMetadata[key] = metadata[key] ?? null
        break
      case 'classification':
        newResolvedMetadata[key] = metadata[key] ?? null
        break
      case 'referrer':
        newResolvedMetadata[key] = metadata[key] ?? null
        break
      case 'formatDetection':
        newResolvedMetadata[key] = metadata[key] ?? null
        break
      case 'manifest':
        newResolvedMetadata[key] = convertUrlsToStrings(metadata[key]) ?? null
        break
      case 'pinterest':
        newResolvedMetadata[key] = convertUrlsToStrings(metadata[key]) ?? null
        break
      case 'other':
        newResolvedMetadata.other = Object.assign(
          {},
          newResolvedMetadata.other,
          metadata.other
        )
        if (metadata.other) {
          if ('apple-touch-fullscreen' in metadata.other) {
            buildState.warnings.add(
              `Use appleWebApp instead\nRead more: https://nextjs.org/docs/app/api-reference/functions/generate-metadata`
            )
          }
          if ('apple-touch-icon-precomposed' in metadata.other) {
            buildState.warnings.add(
              `Use icons.apple instead\nRead more: https://nextjs.org/docs/app/api-reference/functions/generate-metadata`
            )
          }
        }
        break
      case 'metadataBase':
        newResolvedMetadata.metadataBase = metadataBase
          ? metadataBase.toString()
          : null
        break

      case 'apple-touch-fullscreen': {
        buildState.warnings.add(
          `Use appleWebApp instead\nRead more: https://nextjs.org/docs/app/api-reference/functions/generate-metadata`
        )
        break
      }
      case 'apple-touch-icon-precomposed': {
        buildState.warnings.add(
          `Use icons.apple instead\nRead more: https://nextjs.org/docs/app/api-reference/functions/generate-metadata`
        )
        break
      }
      case 'themeColor':
      case 'colorScheme':
      case 'viewport':
        if (metadata[key] != null) {
          buildState.warnings.add(
            `Unsupported metadata ${key} is configured in metadata export in ${route}. Please move it to viewport export instead.\nRead more: https://nextjs.org/docs/app/api-reference/functions/generate-viewport`
          )
        }
        break
      default: {
        key satisfies never
      }
    }
  }

  return mergeStaticMetadata(
    metadataBase,
    metadata,
    newResolvedMetadata,
    staticFilesMetadata,
    metadataContext,
    titleTemplates,
    leafSegmentStaticIcons,
    pathname
  )
}

/**
 * Merges the given viewport with the resolved viewport. Returns a new object.
 */
export function mergeViewport(
  {
    resolvedViewport,
    viewport,
  }: {
    resolvedViewport: ResolvedViewport
    viewport: Viewport | null
  },
  cloneResolvedViewport = true
): ResolvedViewport {
  const newResolvedViewport = cloneResolvedViewport
    ? structuredClone(resolvedViewport)
    : resolvedViewport

  if (viewport) {
    for (const key_ in viewport) {
      const key = key_ as keyof Viewport

      switch (key) {
        case 'themeColor': {
          newResolvedViewport.themeColor = resolveThemeColor(
            viewport.themeColor
          )
          break
        }
        case 'colorScheme':
          newResolvedViewport.colorScheme = viewport.colorScheme || null
          break
        case 'width':
        case 'height':
        case 'initialScale':
        case 'minimumScale':
        case 'maximumScale':
        case 'userScalable':
        case 'viewportFit':
        case 'interactiveWidget':
          // always override the target with the source
          // @ts-ignore viewport properties
          newResolvedViewport[key] = viewport[key]
          break
        default:
          key satisfies never
      }
    }
  }

  return newResolvedViewport
}

export function getDefinedViewport(
  mod: any,
  props: SegmentProps,
  tracingProps: { route: string }
): Viewport | ViewportResolver | null {
  if (typeof mod.generateViewport === 'function') {
    const { route } = tracingProps
    const segmentProps = createSegmentProps(mod.generateViewport, props)

    return Object.assign(
      (parent: ResolvingViewport) =>
        getTracer().trace(
          ResolveMetadataSpan.generateViewport,
          {
            spanName: `generateViewport ${route}`,
            attributes: {
              'next.page': route,
            },
          },
          () => mod.generateViewport(segmentProps, parent)
        ),
      { $$original: mod.generateViewport }
    )
  }
  return mod.viewport || null
}

export function getDefinedMetadata(
  mod: any,
  props: SegmentProps,
  tracingProps: { route: string }
): Metadata | MetadataResolver | null {
  if (typeof mod.generateMetadata === 'function') {
    const { route } = tracingProps
    const segmentProps = createSegmentProps(mod.generateMetadata, props)

    return Object.assign(
      (parent: ResolvingMetadata) =>
        getTracer().trace(
          ResolveMetadataSpan.generateMetadata,
          {
            spanName: `generateMetadata ${route}`,
            attributes: {
              'next.page': route,
            },
          },
          () => mod.generateMetadata(segmentProps, parent)
        ),
      { $$original: mod.generateMetadata }
    )
  }
  return mod.metadata || null
}

/**
 * If `fn` is a `'use cache'` function, we add special markers to the props,
 * that the cache wrapper reads and removes, before passing the props to the
 * user function.
 */
function createSegmentProps(
  fn: Function,
  props: SegmentProps
): SegmentProps | UseCacheSegmentProps {
  return isUseCacheFunction(fn)
    ? 'searchParams' in props
      ? { ...props, $$isPage: true }
      : { ...props, $$isLayout: true }
    : props
}

async function collectStaticImagesFiles(
  metadata: AppDirModules['metadata'],
  props: SegmentProps,
  type: keyof NonNullable<AppDirModules['metadata']>
) {
  if (!metadata?.[type]) return undefined

  const iconPromises = metadata[type as 'icon' | 'apple'].map(
    async (imageModule: (p: any) => Promise<MetadataImageModule[]>) =>
      await imageModule(props)
  )

  return iconPromises?.length > 0
    ? (await Promise.all(iconPromises)).flat()
    : undefined
}

export async function resolveStaticMetadata(
  modules: AppDirModules,
  props: SegmentProps
): Promise<StaticMetadata> {
  const { metadata } = modules
  if (!metadata) return null

  const [icon, apple, openGraph, twitter] = await Promise.all([
    collectStaticImagesFiles(metadata, props, 'icon'),
    collectStaticImagesFiles(metadata, props, 'apple'),
    collectStaticImagesFiles(metadata, props, 'openGraph'),
    collectStaticImagesFiles(metadata, props, 'twitter'),
  ])

  const staticMetadata = {
    icon,
    apple,
    openGraph,
    twitter,
    manifest: metadata.manifest,
  }

  return staticMetadata
}

type WithTitle = { title?: AbsoluteTemplateString | null }
type WithDescription = { description?: string | null }

const isTitleTruthy = (title: AbsoluteTemplateString | null | undefined) =>
  !!title?.absolute
const hasTitle = (metadata: WithTitle | null) => isTitleTruthy(metadata?.title)

function inheritFromMetadata(
  target: (WithTitle & WithDescription) | null,
  metadata: ResolvedMetadata
) {
  if (target) {
    if (!hasTitle(target) && hasTitle(metadata)) {
      target.title = metadata.title
    }
    if (!target.description && metadata.description) {
      target.description = metadata.description
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const commonOgKeys = ['title', 'description', 'images'] as const
export function postProcessMetadata(
  metadata: ResolvedMetadata,
  favicon: any,
  titleTemplates: TitleTemplates,
  metadataContext: MetadataContext
): ResolvedMetadata {
  const { openGraph, twitter } = metadata

  if (openGraph) {
    // If there's openGraph information but not configured in twitter,
    // inherit them from openGraph metadata.
    let autoFillProps: Partial<{
      [Key in (typeof commonOgKeys)[number]]: NonNullable<
        ResolvedMetadata['openGraph']
      >[Key]
    }> = {}
    const hasTwTitle = hasTitle(twitter)
    const hasTwDescription = twitter?.description
    const hasTwImages = Boolean(
      twitter?.hasOwnProperty('images') && twitter.images
    )
    if (!hasTwTitle) {
      if (isTitleTruthy(openGraph.title)) {
        autoFillProps.title = openGraph.title
      } else if (metadata.title && isTitleTruthy(metadata.title)) {
        autoFillProps.title = metadata.title
      }
    }
    if (!hasTwDescription)
      autoFillProps.description =
        openGraph.description || metadata.description || undefined
    if (!hasTwImages) autoFillProps.images = openGraph.images

    if (Object.keys(autoFillProps).length > 0) {
      const partialTwitter = resolveTwitter(
        autoFillProps,
        normalizeMetadataBase(metadata.metadataBase),
        metadataContext,
        titleTemplates.twitter
      )
      if (metadata.twitter) {
        metadata.twitter = Object.assign({}, metadata.twitter, {
          ...(!hasTwTitle && { title: partialTwitter?.title }),
          ...(!hasTwDescription && {
            description: partialTwitter?.description,
          }),
          ...(!hasTwImages && { images: partialTwitter?.images }),
        })
      } else {
        metadata.twitter = convertUrlsToStrings(partialTwitter)
      }
    }
  }

  // If there's no title and description configured in openGraph or twitter,
  // use the title and description from metadata.
  inheritFromMetadata(openGraph, metadata)
  inheritFromMetadata(twitter, metadata)

  if (favicon) {
    if (!metadata.icons) {
      metadata.icons = {
        icon: [],
        apple: [],
      }
    }

    metadata.icons.icon.unshift(favicon)
  }

  return metadata
}

export function createSelectedMetadata(
  metadata: ResolvedMetadata
): SelectedMetadata {
  const {
    metadataBase,
    title,
    openGraph,
    twitter,
    themeColor,
    colorScheme,
    viewport,
    ...metadataTagFields
  } = metadata

  // These fields are only used while resolving metadata, or are rendered by
  // the separate viewport pipeline.
  void metadataBase
  void themeColor
  void colorScheme
  void viewport

  return {
    ...metadataTagFields,
    title: title?.absolute || null,
    openGraph: openGraph
      ? { ...openGraph, title: openGraph.title.absolute }
      : null,
    twitter: twitter ? { ...twitter, title: twitter.title.absolute } : null,
  }
}
