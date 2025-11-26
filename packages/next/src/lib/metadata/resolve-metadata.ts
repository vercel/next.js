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
import type { GetDynamicParamFromSegment } from '../../server/app-render/app-render'
import type { Twitter } from './types/twitter-types'
import type { OpenGraph } from './types/opengraph-types'
import type { AppDirModules } from '../../build/webpack/loaders/next-app-loader'
import type { MetadataContext } from './types/resolvers'
import type { LoaderTree } from '../../server/lib/app-dir-module'
import type {
  AbsoluteTemplateString,
  IconDescriptor,
  ResolvedIcons,
} from './types/metadata-types'
import type { ParsedUrlQuery } from 'querystring'
import type { StaticMetadata } from './types/icons'
import type { WorkStore } from '../../server/app-render/work-async-storage.external'
import type { Params } from '../../server/request/params'
import type { SearchParams } from '../../server/request/search-params'

// eslint-disable-next-line import/no-extraneous-dependencies
import 'server-only'

import { cache } from 'react'
import {
  createDefaultMetadata,
  createDefaultViewport,
} from './default-metadata'
import { resolveOpenGraph, resolveTwitter } from './resolvers/resolve-opengraph'
import { resolveTitle } from './resolvers/resolve-title'
import { resolveAsArrayOrUndefined } from './generate/utils'
import {
  getComponentTypeModule,
  getLayoutOrPageModule,
} from '../../server/lib/app-dir-module'
import { interopDefault } from '../interop-default'
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
import { PAGE_SEGMENT_KEY } from '../../shared/lib/segment'
import * as Log from '../../build/output/log'
import { createServerParamsForMetadata } from '../../server/request/params'
import type { MetadataBaseURL } from './resolvers/resolve-url'
import {
  getUseCacheFunctionInfo,
  isUseCacheFunction,
} from '../client-and-server-references'
import type {
  UseCacheLayoutProps,
  UseCachePageProps,
} from '../../server/use-cache/use-cache-wrapper'
import { createLazyResult } from '../../server/lib/lazy-result'

type StaticIcons = Pick<ResolvedIcons, 'icon' | 'apple'>

type Resolved<T> = T extends Metadata ? ResolvedMetadata : ResolvedViewport

type InstrumentedResolver<TData> = ((
  parent: Promise<Resolved<TData>>
) => TData | Promise<TData>) & {
  $$original: (
    props: unknown,
    parent: Promise<Resolved<TData>>
  ) => TData | Promise<TData>
}

type MetadataResolver = InstrumentedResolver<Metadata>
type ViewportResolver = InstrumentedResolver<Viewport>

export type MetadataErrorType = 'not-found' | 'forbidden' | 'unauthorized'

export type MetadataItems = Array<
  [Metadata | MetadataResolver | null, StaticMetadata]
>

export type ViewportItems = Array<Viewport | ViewportResolver | null>

type TitleTemplates = {
  title: string | null
  twitter: string | null
  openGraph: string | null
}

type BuildState = {
  warnings: Set<string>
}

type LayoutProps = {
  params: Promise<Params>
}

type PageProps = {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}

type SegmentProps = LayoutProps | PageProps
type UseCacheSegmentProps = UseCacheLayoutProps | UseCachePageProps

function isFavicon(icon: IconDescriptor | undefined): boolean {
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

function convertUrlsToStrings<T>(input: T): WithStringifiedURLs<T> {
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
async function mergeMetadata(
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
  }
): Promise<ResolvedMetadata> {
  const newResolvedMetadata = structuredClone(resolvedMetadata)

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
function mergeViewport({
  resolvedViewport,
  viewport,
}: {
  resolvedViewport: ResolvedViewport
  viewport: Viewport | null
}): ResolvedViewport {
  const newResolvedViewport = structuredClone(resolvedViewport)

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

function getDefinedViewport(
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

function getDefinedMetadata(
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
      interopDefault(await imageModule(props))
  )

  return iconPromises?.length > 0
    ? (await Promise.all(iconPromises))?.flat()
    : undefined
}

async function resolveStaticMetadata(
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

// [layout.metadata, static files metadata] -> ... -> [page.metadata, static files metadata]
async function collectMetadata({
  tree,
  metadataItems,
  errorMetadataItem,
  props,
  route,
  errorConvention,
}: {
  tree: LoaderTree
  metadataItems: MetadataItems
  errorMetadataItem: MetadataItems[number]
  props: SegmentProps
  route: string
  errorConvention?: MetadataErrorType
}) {
  let mod
  let modType
  const hasErrorConventionComponent = Boolean(
    errorConvention && tree[2][errorConvention]
  )
  if (errorConvention) {
    mod = await getComponentTypeModule(tree, 'layout')
    modType = errorConvention
  } else {
    const { mod: layoutOrPageMod, modType: layoutOrPageModType } =
      await getLayoutOrPageModule(tree)
    mod = layoutOrPageMod
    modType = layoutOrPageModType
  }

  if (modType) {
    route += `/${modType}`
  }

  const staticFilesMetadata = await resolveStaticMetadata(tree[2], props)
  const metadataExport = mod ? getDefinedMetadata(mod, props, { route }) : null

  metadataItems.push([metadataExport, staticFilesMetadata])

  if (hasErrorConventionComponent && errorConvention) {
    const errorMod = await getComponentTypeModule(tree, errorConvention)
    const errorMetadataExport = errorMod
      ? getDefinedMetadata(errorMod, props, { route })
      : null

    errorMetadataItem[0] = errorMetadataExport
    errorMetadataItem[1] = staticFilesMetadata
  }
}

// [layout.metadata, static files metadata] -> ... -> [page.metadata, static files metadata]
async function collectViewport({
  tree,
  viewportItems,
  errorViewportItemRef,
  props,
  route,
  errorConvention,
}: {
  tree: LoaderTree
  viewportItems: ViewportItems
  errorViewportItemRef: ErrorViewportItemRef
  props: SegmentProps
  route: string
  errorConvention?: MetadataErrorType
}) {
  let mod
  let modType
  const hasErrorConventionComponent = Boolean(
    errorConvention && tree[2][errorConvention]
  )
  if (errorConvention) {
    mod = await getComponentTypeModule(tree, 'layout')
    modType = errorConvention
  } else {
    const { mod: layoutOrPageMod, modType: layoutOrPageModType } =
      await getLayoutOrPageModule(tree)
    mod = layoutOrPageMod
    modType = layoutOrPageModType
  }

  if (modType) {
    route += `/${modType}`
  }

  const viewportExport = mod ? getDefinedViewport(mod, props, { route }) : null

  viewportItems.push(viewportExport)

  if (hasErrorConventionComponent && errorConvention) {
    const errorMod = await getComponentTypeModule(tree, errorConvention)
    const errorViewportExport = errorMod
      ? getDefinedViewport(errorMod, props, { route })
      : null

    errorViewportItemRef.current = errorViewportExport
  }
}

const resolveMetadataItems = cache(async function (
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  workStore: WorkStore
) {
  const parentParams = {}
  const metadataItems: MetadataItems = []
  const errorMetadataItem: MetadataItems[number] = [null, null]
  const treePrefix = undefined
  return resolveMetadataItemsImpl(
    metadataItems,
    tree,
    treePrefix,
    parentParams,
    searchParams,
    errorConvention,
    errorMetadataItem,
    getDynamicParamFromSegment,
    workStore
  )
})

async function resolveMetadataItemsImpl(
  metadataItems: MetadataItems,
  tree: LoaderTree,
  /** Provided tree can be nested subtree, this argument says what is the path of such subtree */
  treePrefix: undefined | string[],
  parentParams: Params,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  errorMetadataItem: MetadataItems[number],
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  workStore: WorkStore
): Promise<MetadataItems> {
  const [segment, parallelRoutes, { page }] = tree
  const currentTreePrefix =
    treePrefix && treePrefix.length ? [...treePrefix, segment] : [segment]
  const isPage = typeof page !== 'undefined'

  // Handle dynamic segment params.
  const segmentParam = getDynamicParamFromSegment(segment)
  /**
   * Create object holding the parent params and current params
   */
  let currentParams = parentParams
  if (segmentParam && segmentParam.value !== null) {
    currentParams = {
      ...parentParams,
      [segmentParam.param]: segmentParam.value,
    }
  }

  const params = createServerParamsForMetadata(currentParams, workStore)
  const props: SegmentProps = isPage ? { params, searchParams } : { params }

  await collectMetadata({
    tree,
    metadataItems,
    errorMetadataItem,
    errorConvention,
    props,
    route: currentTreePrefix
      // __PAGE__ shouldn't be shown in a route
      .filter((s) => s !== PAGE_SEGMENT_KEY)
      .join('/'),
  })

  for (const key in parallelRoutes) {
    const childTree = parallelRoutes[key]
    await resolveMetadataItemsImpl(
      metadataItems,
      childTree,
      currentTreePrefix,
      currentParams,
      searchParams,
      errorConvention,
      errorMetadataItem,
      getDynamicParamFromSegment,
      workStore
    )
  }

  if (Object.keys(parallelRoutes).length === 0 && errorConvention) {
    // If there are no parallel routes, place error metadata as the last item.
    // e.g. layout -> layout -> not-found
    metadataItems.push(errorMetadataItem)
  }

  return metadataItems
}

type ErrorViewportItemRef = { current: ViewportItems[number] }
const resolveViewportItems = cache(async function (
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  workStore: WorkStore
) {
  const parentParams = {}
  const viewportItems: ViewportItems = []
  const errorViewportItemRef: ErrorViewportItemRef = {
    current: null,
  }
  const treePrefix = undefined
  return resolveViewportItemsImpl(
    viewportItems,
    tree,
    treePrefix,
    parentParams,
    searchParams,
    errorConvention,
    errorViewportItemRef,
    getDynamicParamFromSegment,
    workStore
  )
})

async function resolveViewportItemsImpl(
  viewportItems: ViewportItems,
  tree: LoaderTree,
  /** Provided tree can be nested subtree, this argument says what is the path of such subtree */
  treePrefix: undefined | string[],
  parentParams: Params,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  errorViewportItemRef: ErrorViewportItemRef,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  workStore: WorkStore
): Promise<ViewportItems> {
  const [segment, parallelRoutes, { page }] = tree
  const currentTreePrefix =
    treePrefix && treePrefix.length ? [...treePrefix, segment] : [segment]
  const isPage = typeof page !== 'undefined'

  // Handle dynamic segment params.
  const segmentParam = getDynamicParamFromSegment(segment)
  /**
   * Create object holding the parent params and current params
   */
  let currentParams = parentParams
  if (segmentParam && segmentParam.value !== null) {
    currentParams = {
      ...parentParams,
      [segmentParam.param]: segmentParam.value,
    }
  }

  const params = createServerParamsForMetadata(currentParams, workStore)

  let layerProps: LayoutProps | PageProps
  if (isPage) {
    layerProps = {
      params,
      searchParams,
    }
  } else {
    layerProps = {
      params,
    }
  }

  await collectViewport({
    tree,
    viewportItems,
    errorViewportItemRef,
    errorConvention,
    props: layerProps,
    route: currentTreePrefix
      // __PAGE__ shouldn't be shown in a route
      .filter((s) => s !== PAGE_SEGMENT_KEY)
      .join('/'),
  })

  for (const key in parallelRoutes) {
    const childTree = parallelRoutes[key]
    await resolveViewportItemsImpl(
      viewportItems,
      childTree,
      currentTreePrefix,
      currentParams,
      searchParams,
      errorConvention,
      errorViewportItemRef,
      getDynamicParamFromSegment,
      workStore
    )
  }

  if (Object.keys(parallelRoutes).length === 0 && errorConvention) {
    // If there are no parallel routes, place error metadata as the last item.
    // e.g. layout -> layout -> not-found
    viewportItems.push(errorViewportItemRef.current)
  }

  return viewportItems
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
function postProcessMetadata(
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

type Result<T> = null | T | Promise<null | T> | PromiseLike<null | T>

function prerenderMetadata(metadataItems: MetadataItems) {
  // If the index is a function then it is a resolver and the next slot
  // is the corresponding result. If the index is not a function it is the result
  // itself.
  const resolversAndResults: Array<
    ((value: ResolvedMetadata) => void) | Result<Metadata>
  > = []
  for (let i = 0; i < metadataItems.length; i++) {
    const metadataExport = metadataItems[i][0]
    getResult<Metadata>(resolversAndResults, metadataExport)
  }
  return resolversAndResults
}

function prerenderViewport(viewportItems: ViewportItems) {
  // If the index is a function then it is a resolver and the next slot
  // is the corresponding result. If the index is not a function it is the result
  // itself.
  const resolversAndResults: Array<
    ((value: ResolvedViewport) => void) | Result<Viewport>
  > = []
  for (let i = 0; i < viewportItems.length; i++) {
    const viewportExport = viewportItems[i]
    getResult<Viewport>(resolversAndResults, viewportExport)
  }
  return resolversAndResults
}

const noop = () => {}

function getResult<TData extends object>(
  resolversAndResults: Array<
    ((value: Resolved<TData>) => void) | Result<TData>
  >,
  exportForResult: null | TData | InstrumentedResolver<TData>
) {
  if (typeof exportForResult === 'function') {
    // If the function is a 'use cache' function that uses the parent data as
    // the second argument, we don't want to eagerly execute it during
    // metadata/viewport pre-rendering, as the parent data might also be
    // computed from another 'use cache' function. To ensure that the hanging
    // input abort signal handling works in this case (i.e. the depending
    // function waits for the cached input to resolve while encoding its args),
    // they must be called sequentially. This can be accomplished by wrapping
    // the call in a lazy promise, so that the original function is only called
    // when the result is actually awaited.
    const useCacheFunctionInfo = getUseCacheFunctionInfo(
      exportForResult.$$original
    )
    if (useCacheFunctionInfo && useCacheFunctionInfo.usedArgs[1]) {
      const promise = new Promise<Resolved<TData>>((resolve) =>
        resolversAndResults.push(resolve)
      )
      resolversAndResults.push(
        createLazyResult(async () => exportForResult(promise))
      )
    } else {
      let result: TData | Promise<TData>
      if (useCacheFunctionInfo) {
        resolversAndResults.push(noop)
        // @ts-expect-error We intentionally omit the parent argument, because
        // we know from the check above that the 'use cache' function does not
        // use it.
        result = exportForResult()
      } else {
        result = exportForResult(
          new Promise<Resolved<TData>>((resolve) =>
            resolversAndResults.push(resolve)
          )
        )
      }
      resolversAndResults.push(result)
      if (result instanceof Promise) {
        // since we eager execute generateMetadata and
        // they can reject at anytime we need to ensure
        // we attach the catch handler right away to
        // prevent unhandled rejections crashing the process
        result.catch((err) => {
          return {
            __nextError: err,
          }
        })
      }
    }
  } else if (typeof exportForResult === 'object') {
    resolversAndResults.push(exportForResult)
  } else {
    resolversAndResults.push(null)
  }
}

function freezeInDev<T extends object>(obj: T): T {
  if (process.env.NODE_ENV === 'development') {
    return (
      require('../../shared/lib/deep-freeze') as typeof import('../../shared/lib/deep-freeze')
    ).deepFreeze(obj) as T
  }

  return obj
}

export async function accumulateMetadata(
  route: string,
  metadataItems: MetadataItems,
  pathname: Promise<string>,
  metadataContext: MetadataContext
): Promise<ResolvedMetadata> {
  let resolvedMetadata = createDefaultMetadata()

  let titleTemplates: TitleTemplates = {
    title: null,
    twitter: null,
    openGraph: null,
  }

  const buildState = {
    warnings: new Set<string>(),
  }

  let favicon

  // Collect the static icons in the most leaf node,
  // since we don't collect all the static metadata icons in the parent segments.
  const leafSegmentStaticIcons = {
    icon: [],
    apple: [],
  }

  const resolversAndResults = prerenderMetadata(metadataItems)
  let resultIndex = 0

  for (let i = 0; i < metadataItems.length; i++) {
    const staticFilesMetadata = metadataItems[i][1]
    // Treat favicon as special case, it should be the first icon in the list
    // i <= 1 represents root layout, and if current page is also at root
    if (i <= 1 && isFavicon(staticFilesMetadata?.icon?.[0])) {
      const iconMod = staticFilesMetadata?.icon?.shift()
      if (i === 0) favicon = iconMod
    }

    let pendingMetadata = resolversAndResults[resultIndex++]
    if (typeof pendingMetadata === 'function') {
      // This metadata item had a `generateMetadata` and
      // we need to provide the currently resolved metadata
      // to it before we continue;
      const resolveParentMetadata = pendingMetadata
      // we know that the next item is a result if this item
      // was a resolver
      pendingMetadata = resolversAndResults[resultIndex++] as Result<Metadata>

      resolveParentMetadata(freezeInDev(resolvedMetadata))
    }
    // Otherwise the item was either null or a static export

    let metadata: Metadata | null
    if (isPromiseLike(pendingMetadata)) {
      metadata = await pendingMetadata
    } else {
      metadata = pendingMetadata
    }

    resolvedMetadata = await mergeMetadata(route, pathname, {
      resolvedMetadata,
      metadata,
      metadataContext,
      staticFilesMetadata,
      titleTemplates,
      buildState,
      leafSegmentStaticIcons,
    })

    // If the layout is the same layer with page, skip the leaf layout and leaf page
    // The leaf layout and page are the last two items
    if (i < metadataItems.length - 2) {
      titleTemplates = {
        title: resolvedMetadata.title?.template || null,
        openGraph: resolvedMetadata.openGraph?.title.template || null,
        twitter: resolvedMetadata.twitter?.title.template || null,
      }
    }
  }

  if (
    leafSegmentStaticIcons.icon.length > 0 ||
    leafSegmentStaticIcons.apple.length > 0
  ) {
    if (!resolvedMetadata.icons) {
      resolvedMetadata.icons = {
        icon: [],
        apple: [],
      }
      if (leafSegmentStaticIcons.icon.length > 0) {
        resolvedMetadata.icons.icon.unshift(...leafSegmentStaticIcons.icon)
      }
      if (leafSegmentStaticIcons.apple.length > 0) {
        resolvedMetadata.icons.apple.unshift(...leafSegmentStaticIcons.apple)
      }
    }
  }

  // Only log warnings if there are any, and only once after the metadata resolving process is finished
  if (buildState.warnings.size > 0) {
    for (const warning of buildState.warnings) {
      Log.warn(warning)
    }
  }

  return postProcessMetadata(
    resolvedMetadata,
    favicon,
    titleTemplates,
    metadataContext
  )
}

export async function accumulateViewport(
  viewportItems: ViewportItems
): Promise<ResolvedViewport> {
  let resolvedViewport: ResolvedViewport = createDefaultViewport()

  const resolversAndResults = prerenderViewport(viewportItems)
  let i = 0

  while (i < resolversAndResults.length) {
    let pendingViewport = resolversAndResults[i++]
    if (typeof pendingViewport === 'function') {
      // this viewport item had a `generateViewport` and
      // we need to provide the currently resolved viewport
      // to it before we continue;
      const resolveParentViewport = pendingViewport
      // we know that the next item is a result if this item
      // was a resolver
      pendingViewport = resolversAndResults[i++] as Result<Viewport>

      resolveParentViewport(freezeInDev(resolvedViewport))
    }
    // Otherwise the item was either null or a static export

    let viewport: Viewport | null
    if (isPromiseLike(pendingViewport)) {
      viewport = await pendingViewport
    } else {
      viewport = pendingViewport
    }

    resolvedViewport = mergeViewport({ resolvedViewport, viewport })
  }

  return resolvedViewport
}

// Exposed API for metadata component, that directly resolve the loader tree and related context as resolved metadata.
export async function resolveMetadata(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  workStore: WorkStore,
  metadataContext: MetadataContext
): Promise<ResolvedMetadata> {
  const metadataItems = await resolveMetadataItems(
    tree,
    searchParams,
    errorConvention,
    getDynamicParamFromSegment,
    workStore
  )
  return accumulateMetadata(
    workStore.route,
    metadataItems,
    pathname,
    metadataContext
  )
}

// Exposed API for viewport component, that directly resolve the loader tree and related context as resolved viewport.
export async function resolveViewport(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  workStore: WorkStore
): Promise<ResolvedViewport> {
  const viewportItems = await resolveViewportItems(
    tree,
    searchParams,
    errorConvention,
    getDynamicParamFromSegment,
    workStore
  )
  return accumulateViewport(viewportItems)
}

function isPromiseLike<T>(
  value: unknown | PromiseLike<T>
): value is PromiseLike<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  )
}
