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
import type { WorkStore } from '../../server/app-render/work-async-storage.external'
import type { Params } from '../../server/request/params'

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

type StaticIcons = Pick<ResolvedIcons, 'icon' | 'apple'>

type MetadataResolver = (
  parent: ResolvingMetadata
) => Metadata | Promise<Metadata>
type ViewportResolver = (
  parent: ResolvingViewport
) => Viewport | Promise<Viewport>

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

async function mergeStaticMetadata(
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
      target.metadataBase,
      { ...metadataContext, isStaticMetadataRouteFile: true },
      titleTemplates.twitter
    )
    target.twitter = resolvedTwitter
  }

  // file based metadata is specified and current level metadata openGraph.images is not specified
  if (openGraph && !source?.openGraph?.hasOwnProperty('images')) {
    const resolvedOpenGraph = await resolveOpenGraph(
      { ...target.openGraph, images: openGraph } as OpenGraph,
      target.metadataBase,
      pathname,
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
async function mergeMetadata(
  route: string,
  pathname: Promise<string>,
  {
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
  }
): Promise<ResolvedMetadata> {
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
        target.alternates = await resolveAlternates(
          source.alternates,
          metadataBase,
          pathname,
          metadataContext
        )
        break
      }
      case 'openGraph': {
        target.openGraph = await resolveOpenGraph(
          source.openGraph,
          metadataBase,
          pathname,
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
        target[key] = await resolveItunes(
          source.itunes,
          metadataBase,
          pathname,
          metadataContext
        )
        break
      }
      case 'pagination': {
        target.pagination = await resolvePagination(
          source.pagination,
          metadataBase,
          pathname,
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
      case 'pinterest':
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
            `Unsupported metadata ${key} is configured in metadata export in ${route}. Please move it to viewport export instead.\nRead more: https://nextjs.org/docs/app/api-reference/functions/generate-viewport`
          )
        }
        break
      }
    }
  }
  return mergeStaticMetadata(
    source,
    target,
    staticFilesMetadata,
    metadataContext,
    titleTemplates,
    leafSegmentStaticIcons,
    pathname
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
        // always override the target with the source
        // @ts-ignore viewport properties
        target[key] = source[key]
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
    getResult(resolversAndResults, metadataExport)
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
    getResult(resolversAndResults, viewportExport)
  }
  return resolversAndResults
}

type Resolved<T> = T extends Metadata ? ResolvedMetadata : ResolvedViewport

function getResult<T extends Metadata | Viewport>(
  resolversAndResults: Array<((value: Resolved<T>) => void) | Result<T>>,
  exportForResult: null | T | ((parent: Promise<Resolved<T>>) => Result<T>)
) {
  if (typeof exportForResult === 'function') {
    const result = exportForResult(
      new Promise<Resolved<T>>((resolve) => resolversAndResults.push(resolve))
    )
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
  } else if (typeof exportForResult === 'object') {
    resolversAndResults.push(exportForResult)
  } else {
    resolversAndResults.push(null)
  }
}

function resolvePendingResult<
  ResolvedType extends ResolvedMetadata | ResolvedViewport,
>(
  parentResult: ResolvedType,
  resolveParentResult: (value: ResolvedType) => void
): void {
  // In dev we clone and freeze to prevent relying on mutating resolvedMetadata directly.
  // In prod we just pass resolvedMetadata through without any copying.
  if (process.env.NODE_ENV === 'development') {
    parentResult = require('../../shared/lib/deep-freeze').deepFreeze(
      require('./clone-metadata').cloneMetadata(parentResult)
    )
  }

  resolveParentResult(parentResult)
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

      resolvePendingResult(resolvedMetadata, resolveParentMetadata)
    }
    // Otherwise the item was either null or a static export

    let metadata: Metadata | null
    if (isPromiseLike(pendingMetadata)) {
      metadata = await pendingMetadata
    } else {
      metadata = pendingMetadata
    }

    resolvedMetadata = await mergeMetadata(route, pathname, {
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
  viewportItems: ViewportItems
): Promise<ResolvedViewport> {
  const resolvedViewport: ResolvedViewport = createDefaultViewport()

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

      resolvePendingResult(resolvedViewport, resolveParentViewport)
    }
    // Otherwise the item was either null or a static export

    let viewport: Viewport | null
    if (isPromiseLike(pendingViewport)) {
      viewport = await pendingViewport
    } else {
      viewport = pendingViewport
    }

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
  const resolvedMetadata = await accumulateMetadata(
    workStore.route,
    metadataItems,
    pathname,
    metadataContext
  )

  if (!errorConvention && workStore.page.endsWith('/page')) {
    console.log(
      'syncing resolvedMetadata from resolveMetadata',
      globalThis.devToolsServerState
    )
    globalThis.devToolsServerState.resolvedMetadata = resolvedMetadata
  }

  return resolvedMetadata
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
