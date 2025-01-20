import type {
  Metadata,
  ResolvedMetadata,
  ResolvedViewport,
  ResolvingMetadata,
  ResolvingViewport,
  Viewport,
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
import type { WorkStore } from '../../server/app-render/work-async-storage.external'
import type {
  Params,
  CreateServerParamsForMetadata,
} from '../../server/request/params'

type StaticIcons = Pick<ResolvedIcons, 'icon' | 'apple'>

type MetadataResolver = (
  parent: ResolvingMetadata
) => Metadata | Promise<Metadata>
type ViewportResolver = (
  parent: ResolvingViewport
) => Viewport | Promise<Viewport>

export type MetadataErrorType = 'not-found' | 'forbidden' | 'unauthorized'

export type MetadataItems = [
  Metadata | MetadataResolver | null,
  StaticMetadata,
  Viewport | ViewportResolver | null,
][]

type TitleTemplates = {
  title: string | null
  twitter: string | null
  openGraph: string | null
}

type BuildState = {
  warnings: Set<string>
}

type LayoutProps = {
  params: { [key: string]: any }
}
type PageProps = {
  params: { [key: string]: any }
  searchParams: { [key: string]: any }
}

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

function mergeStaticMetadata(
  source: Metadata | null,
  target: ResolvedMetadata,
  staticFilesMetadata: StaticMetadata,
  metadataContext: MetadataContext,
  titleTemplates: TitleTemplates,
  leafSegmentStaticIcons: StaticIcons
) {
  if (!staticFilesMetadata) return
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
      target.metadataBase,
      { ...metadataContext, isStaticMetadataRouteFile: true },
      titleTemplates.twitter
    )
    target.twitter = resolvedTwitter
  }

  // file based metadata is specified and current level metadata openGraph.images is not specified
  if (openGraph && !source?.openGraph?.hasOwnProperty('images')) {
    const resolvedOpenGraph = resolveOpenGraph(
      { ...target.openGraph, images: openGraph } as OpenGraph,
      target.metadataBase,
      { ...metadataContext, isStaticMetadataRouteFile: true },
      titleTemplates.openGraph
    )
    target.openGraph = resolvedOpenGraph
  }
  if (manifest) {
    target.manifest = manifest
  }

  return target
}

// Merge the source metadata into the resolved target metadata.
function mergeMetadata({
  source,
  target,
  staticFilesMetadata,
  titleTemplates,
  metadataContext,
  buildState,
  leafSegmentStaticIcons,
}: {
  source: Metadata | null
  target: ResolvedMetadata
  staticFilesMetadata: StaticMetadata
  titleTemplates: TitleTemplates
  metadataContext: MetadataContext
  buildState: BuildState
  leafSegmentStaticIcons: StaticIcons
}): void {
  // If there's override metadata, prefer it otherwise fallback to the default metadata.
  const metadataBase =
    typeof source?.metadataBase !== 'undefined'
      ? source.metadataBase
      : target.metadataBase
  for (const key_ in source) {
    const key = key_ as keyof Metadata

    switch (key) {
      case 'title': {
        target.title = resolveTitle(source.title, titleTemplates.title)
        break
      }
      case 'alternates': {
        target.alternates = resolveAlternates(
          source.alternates,
          metadataBase,
          metadataContext
        )
        break
      }
      case 'openGraph': {
        target.openGraph = resolveOpenGraph(
          source.openGraph,
          metadataBase,
          metadataContext,
          titleTemplates.openGraph
        )
        break
      }
      case 'twitter': {
        target.twitter = resolveTwitter(
          source.twitter,
          metadataBase,
          metadataContext,
          titleTemplates.twitter
        )
        break
      }
      case 'facebook':
        target.facebook = resolveFacebook(source.facebook)
        break

      case 'verification':
        target.verification = resolveVerification(source.verification)
        break

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
      case 'keywords': {
        target[key] = resolveAsArrayOrUndefined(source[key])
        break
      }
      case 'authors': {
        target[key] = resolveAsArrayOrUndefined(source.authors)
        break
      }
      case 'itunes': {
        target[key] = resolveItunes(
          source.itunes,
          metadataBase,
          metadataContext
        )
        break
      }
      case 'pagination': {
        target.pagination = resolvePagination(
          source.pagination,
          metadataBase,
          metadataContext
        )
        break
      }
      // directly assign fields that fallback to null
      case 'applicationName':
      case 'description':
      case 'generator':
      case 'creator':
      case 'publisher':
      case 'category':
      case 'classification':
      case 'referrer':
      case 'formatDetection':
      case 'manifest':
        // @ts-ignore TODO: support inferring
        target[key] = source[key] || null
        break
      case 'other':
        target.other = Object.assign({}, target.other, source.other)
        break
      case 'metadataBase':
        target.metadataBase = metadataBase
        break

      default: {
        if (
          (key === 'viewport' ||
            key === 'themeColor' ||
            key === 'colorScheme') &&
          source[key] != null
        ) {
          buildState.warnings.add(
            `Unsupported metadata ${key} is configured in metadata export in ${metadataContext.pathname}. Please move it to viewport export instead.\nRead more: https://nextjs.org/docs/app/api-reference/functions/generate-viewport`
          )
        }
        break
      }
    }
  }
  mergeStaticMetadata(
    source,
    target,
    staticFilesMetadata,
    metadataContext,
    titleTemplates,
    leafSegmentStaticIcons
  )
}

function mergeViewport({
  target,
  source,
}: {
  target: ResolvedViewport
  source: Viewport | null
}): void {
  if (!source) return
  for (const key_ in source) {
    const key = key_ as keyof Viewport

    switch (key) {
      case 'themeColor': {
        target.themeColor = resolveThemeColor(source.themeColor)
        break
      }
      case 'colorScheme':
        target.colorScheme = source.colorScheme || null
        break
      default:
        if (typeof source[key] !== 'undefined') {
          // @ts-ignore viewport properties
          target[key] = source[key]
        }
        break
    }
  }
}

function getDefinedViewport(
  mod: any,
  props: any,
  tracingProps: { route: string }
): Viewport | ViewportResolver | null {
  if (typeof mod.generateViewport === 'function') {
    const { route } = tracingProps
    return (parent: ResolvingViewport) =>
      getTracer().trace(
        ResolveMetadataSpan.generateViewport,
        {
          spanName: `generateViewport ${route}`,
          attributes: {
            'next.page': route,
          },
        },
        () => mod.generateViewport(props, parent)
      )
  }
  return mod.viewport || null
}

function getDefinedMetadata(
  mod: any,
  props: any,
  tracingProps: { route: string }
): Metadata | MetadataResolver | null {
  if (typeof mod.generateMetadata === 'function') {
    const { route } = tracingProps
    return (parent: ResolvingMetadata) =>
      getTracer().trace(
        ResolveMetadataSpan.generateMetadata,
        {
          spanName: `generateMetadata ${route}`,
          attributes: {
            'next.page': route,
          },
        },
        () => mod.generateMetadata(props, parent)
      )
  }
  return mod.metadata || null
}

async function collectStaticImagesFiles(
  metadata: AppDirModules['metadata'],
  props: any,
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
  props: any
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
  props: any
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

  const viewportExport = mod ? getDefinedViewport(mod, props, { route }) : null

  metadataItems.push([metadataExport, staticFilesMetadata, viewportExport])

  if (hasErrorConventionComponent && errorConvention) {
    const errorMod = await getComponentTypeModule(tree, errorConvention)
    const errorViewportExport = errorMod
      ? getDefinedViewport(errorMod, props, { route })
      : null
    const errorMetadataExport = errorMod
      ? getDefinedMetadata(errorMod, props, { route })
      : null

    errorMetadataItem[0] = errorMetadataExport
    errorMetadataItem[1] = staticFilesMetadata
    errorMetadataItem[2] = errorViewportExport
  }
}

const resolveMetadataItems = cache(async function (
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  createServerParamsForMetadata: CreateServerParamsForMetadata,
  workStore: WorkStore
) {
  const parentParams = {}
  const metadataItems: MetadataItems = []
  const errorMetadataItem: MetadataItems[number] = [null, null, null]
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
    createServerParamsForMetadata,
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
  createServerParamsForMetadata: CreateServerParamsForMetadata,
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

  await collectMetadata({
    tree,
    metadataItems,
    errorMetadataItem,
    errorConvention,
    props: layerProps,
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
      createServerParamsForMetadata,
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
        metadata.metadataBase,
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
        metadata.twitter = partialTwitter
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

type DataResolver<Data, ResolvedData> = (
  parent: Promise<ResolvedData>
) => Data | Promise<Data>

function collectMetadataExportPreloading<Data, ResolvedData>(
  results: (Data | Promise<Data>)[],
  dynamicMetadataExportFn: DataResolver<Data, ResolvedData>,
  resolvers: ((value: ResolvedData) => void)[]
) {
  const result = dynamicMetadataExportFn(
    new Promise<any>((resolve) => {
      resolvers.push(resolve)
    })
  )

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
  results.push(result)
}

async function getMetadataFromExport<Data, ResolvedData>(
  getPreloadMetadataExport: (
    metadataItem: NonNullable<MetadataItems[number]>
  ) => Data | DataResolver<Data, ResolvedData> | null,
  dynamicMetadataResolveState: {
    resolvers: ((value: ResolvedData) => void)[]
    resolvingIndex: number
  },
  metadataItems: MetadataItems,
  currentIndex: number,
  resolvedMetadata: ResolvedData,
  metadataResults: (Data | Promise<Data>)[]
) {
  const metadataExport = getPreloadMetadataExport(metadataItems[currentIndex])
  const dynamicMetadataResolvers = dynamicMetadataResolveState.resolvers
  let metadata: Data | null = null
  if (typeof metadataExport === 'function') {
    // Only preload at the beginning when resolves are empty
    if (!dynamicMetadataResolvers.length) {
      for (let j = currentIndex; j < metadataItems.length; j++) {
        const preloadMetadataExport = getPreloadMetadataExport(metadataItems[j])
        // call each `generateMetadata function concurrently and stash their resolver
        if (typeof preloadMetadataExport === 'function') {
          collectMetadataExportPreloading<Data, ResolvedData>(
            metadataResults,
            preloadMetadataExport as DataResolver<Data, ResolvedData>,
            dynamicMetadataResolvers
          )
        }
      }
    }

    const resolveParent =
      dynamicMetadataResolvers[dynamicMetadataResolveState.resolvingIndex]
    const metadataResult =
      metadataResults[dynamicMetadataResolveState.resolvingIndex++]

    // In dev we clone and freeze to prevent relying on mutating resolvedMetadata directly.
    // In prod we just pass resolvedMetadata through without any copying.
    const currentResolvedMetadata =
      process.env.NODE_ENV === 'development'
        ? Object.freeze(
            require('./clone-metadata').cloneMetadata(resolvedMetadata)
          )
        : resolvedMetadata

    // This resolve should unblock the generateMetadata function if it awaited the parent
    // argument. If it didn't await the parent argument it might already have a value since it was
    // called concurrently. Regardless we await the return value before continuing on to the next layer
    resolveParent(currentResolvedMetadata)
    metadata =
      metadataResult instanceof Promise ? await metadataResult : metadataResult

    if (metadata && typeof metadata === 'object' && '__nextError' in metadata) {
      // re-throw caught metadata error from preloading
      throw metadata['__nextError']
    }
  } else if (metadataExport !== null && typeof metadataExport === 'object') {
    // This metadataExport is the object form
    metadata = metadataExport
  }

  return metadata
}

export async function accumulateMetadata(
  metadataItems: MetadataItems,
  metadataContext: MetadataContext
): Promise<ResolvedMetadata> {
  const resolvedMetadata = createDefaultMetadata()
  const metadataResults: (Metadata | Promise<Metadata>)[] = []

  let titleTemplates: TitleTemplates = {
    title: null,
    twitter: null,
    openGraph: null,
  }

  // Loop over all metadata items again, merging synchronously any static object exports,
  // awaiting any static promise exports, and resolving parent metadata and awaiting any generated metadata
  const dynamicMetadataResolvers = {
    resolvers: [],
    resolvingIndex: 0,
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
  for (let i = 0; i < metadataItems.length; i++) {
    const staticFilesMetadata = metadataItems[i][1]

    // Treat favicon as special case, it should be the first icon in the list
    // i <= 1 represents root layout, and if current page is also at root
    if (i <= 1 && isFavicon(staticFilesMetadata?.icon?.[0])) {
      const iconMod = staticFilesMetadata?.icon?.shift()
      if (i === 0) favicon = iconMod
    }

    const metadata = await getMetadataFromExport<Metadata, ResolvedMetadata>(
      (metadataItem) => metadataItem[0],
      dynamicMetadataResolvers,
      metadataItems,
      i,
      resolvedMetadata,
      metadataResults
    )

    mergeMetadata({
      target: resolvedMetadata,
      source: metadata,
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
  metadataItems: MetadataItems
): Promise<ResolvedViewport> {
  const resolvedViewport: ResolvedViewport = createDefaultViewport()

  const viewportResults: (Viewport | Promise<Viewport>)[] = []
  const dynamicMetadataResolvers = {
    resolvers: [],
    resolvingIndex: 0,
  }
  for (let i = 0; i < metadataItems.length; i++) {
    const viewport = await getMetadataFromExport<Viewport, ResolvedViewport>(
      (metadataItem) => metadataItem[2],
      dynamicMetadataResolvers,
      metadataItems,
      i,
      resolvedViewport,
      viewportResults
    )

    mergeViewport({
      target: resolvedViewport,
      source: viewport,
    })
  }
  return resolvedViewport
}

// Exposed API for metadata component, that directly resolve the loader tree and related context as resolved metadata.
export async function resolveMetadata(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  createServerParamsForMetadata: CreateServerParamsForMetadata,
  workStore: WorkStore,
  metadataContext: MetadataContext
): Promise<ResolvedMetadata> {
  const metadataItems = await resolveMetadataItems(
    tree,
    searchParams,
    errorConvention,
    getDynamicParamFromSegment,
    createServerParamsForMetadata,
    workStore
  )
  return accumulateMetadata(metadataItems, metadataContext)
}

// Exposed API for viewport component, that directly resolve the loader tree and related context as resolved viewport.
export async function resolveViewport(
  tree: LoaderTree,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  createServerParamsForMetadata: CreateServerParamsForMetadata,
  workStore: WorkStore
): Promise<ResolvedViewport> {
  const metadataItems = await resolveMetadataItems(
    tree,
    searchParams,
    errorConvention,
    getDynamicParamFromSegment,
    createServerParamsForMetadata,
    workStore
  )
  return accumulateViewport(metadataItems)
}
