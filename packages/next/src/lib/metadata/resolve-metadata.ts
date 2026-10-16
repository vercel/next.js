import type {
  Metadata,
  ResolvedMetadata,
  ResolvedViewport,
  Viewport,
} from './types/metadata-interface'
import { getSegmentParam } from '../../shared/lib/router/utils/get-segment-param'
import type { MetadataContext } from './types/resolvers'
import type { LoaderTree } from '../../server/lib/app-dir-module'
import type { ParsedUrlQuery } from 'querystring'
import { workAsyncStorage } from '../../server/app-render/work-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import type { Params } from '../../server/request/params'

// eslint-disable-next-line import/no-extraneous-dependencies
import 'server-only'

import { cache } from 'react'
import {
  createDefaultMetadata,
  createDefaultViewport,
} from './default-metadata'
import {
  getComponentTypeModule,
  getLayoutOrPageModule,
} from '../../server/lib/app-dir-module'
import { PAGE_SEGMENT_KEY } from '../../shared/lib/segment'
import * as Log from '../../build/output/log'
import { createServerParamsForMetadata } from '../../server/request/params'
import { getUseCacheFunctionInfo } from '../client-and-server-references'
import { createLazyResult } from '../../server/lib/lazy-result'
import {
  type InstrumentedResolver,
  type LayoutProps,
  type MetadataErrorType,
  type MetadataItems,
  type PageProps,
  type SegmentProps,
  type SelectedMetadata,
  type TitleTemplates,
  type ViewportItems,
  createSelectedMetadata,
  getDefinedMetadata,
  getDefinedViewport,
  isFavicon,
  mergeMetadata,
  mergeViewport,
  postProcessMetadata,
  resolveStaticMetadata,
} from './metadata-resolution-primitives'

export type {
  MetadataErrorType,
  MetadataItems,
  SelectedMetadata,
  ViewportItems,
}
export { createSelectedMetadata }

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
  interpolatedParams: Params
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
    null,
    searchParams,
    errorConvention,
    errorMetadataItem,
    interpolatedParams
  )
})

async function resolveMetadataItemsImpl(
  metadataItems: MetadataItems,
  tree: LoaderTree,
  /** Provided tree can be nested subtree, this argument says what is the path of such subtree */
  treePrefix: undefined | string[],
  parentParams: Params,
  parentOptionalCatchAllParamName: string | null,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  errorMetadataItem: MetadataItems[number],
  interpolatedParams: Params
): Promise<MetadataItems> {
  const [segment, parallelRoutes, { page }] = tree
  const currentTreePrefix =
    treePrefix && treePrefix.length ? [...treePrefix, segment] : [segment]
  const isPage = typeof page !== 'undefined'

  // Handle dynamic segment params.
  let currentParams = parentParams
  const segmentParam = getSegmentParam(segment)
  if (segmentParam) {
    const value = interpolatedParams[segmentParam.paramName]
    if (value !== null && value !== undefined) {
      currentParams = {
        ...parentParams,
        [segmentParam.paramName]: value,
      }
    }
  }

  // Track optional catch-all params with no value (see comment in
  // create-component-tree.tsx for full explanation).
  const optionalCatchAllParamName: string | null =
    segmentParam?.paramType === 'optional-catchall' &&
    (interpolatedParams[segmentParam.paramName] === null ||
      interpolatedParams[segmentParam.paramName] === undefined)
      ? segmentParam.paramName
      : parentOptionalCatchAllParamName

  const params = createServerParamsForMetadata(
    currentParams,
    optionalCatchAllParamName
  )
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
      optionalCatchAllParamName,
      searchParams,
      errorConvention,
      errorMetadataItem,
      interpolatedParams
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
  interpolatedParams: Params
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
    null,
    searchParams,
    errorConvention,
    errorViewportItemRef,
    interpolatedParams
  )
})

async function resolveViewportItemsImpl(
  viewportItems: ViewportItems,
  tree: LoaderTree,
  /** Provided tree can be nested subtree, this argument says what is the path of such subtree */
  treePrefix: undefined | string[],
  parentParams: Params,
  parentOptionalCatchAllParamName: string | null,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  errorViewportItemRef: ErrorViewportItemRef,
  interpolatedParams: Params
): Promise<ViewportItems> {
  const [segment, parallelRoutes, { page }] = tree
  const currentTreePrefix =
    treePrefix && treePrefix.length ? [...treePrefix, segment] : [segment]
  const isPage = typeof page !== 'undefined'

  // Handle dynamic segment params.
  let currentParams = parentParams
  const segmentParam = getSegmentParam(segment)
  if (segmentParam) {
    const value = interpolatedParams[segmentParam.paramName]
    if (value !== null && value !== undefined) {
      currentParams = {
        ...parentParams,
        [segmentParam.paramName]: value,
      }
    }
  }

  // Track optional catch-all params with no value (see comment in
  // create-component-tree.tsx for full explanation).
  const optionalCatchAllParamName: string | null =
    segmentParam?.paramType === 'optional-catchall' &&
    (interpolatedParams[segmentParam.paramName] === null ||
      interpolatedParams[segmentParam.paramName] === undefined)
      ? segmentParam.paramName
      : parentOptionalCatchAllParamName

  const params = createServerParamsForMetadata(
    currentParams,
    optionalCatchAllParamName
  )

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
      optionalCatchAllParamName,
      searchParams,
      errorConvention,
      errorViewportItemRef,
      interpolatedParams
    )
  }

  if (Object.keys(parallelRoutes).length === 0 && errorConvention) {
    // If there are no parallel routes, place error metadata as the last item.
    // e.g. layout -> layout -> not-found
    viewportItems.push(errorViewportItemRef.current)
  }

  return viewportItems
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
    getResult<Metadata, ResolvedMetadata>(resolversAndResults, metadataExport)
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
    getResult<Viewport, ResolvedViewport>(resolversAndResults, viewportExport)
  }
  return resolversAndResults
}

const noop = () => {}

function getResult<TData extends object, TResolved>(
  resolversAndResults: Array<((value: TResolved) => void) | Result<TData>>,
  exportForResult: null | TData | InstrumentedResolver<TData, TResolved>
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
      const promise = new Promise<TResolved>((resolve) =>
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
          new Promise<TResolved>((resolve) => resolversAndResults.push(resolve))
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
  interpolatedParams: Params,
  metadataContext: MetadataContext
): Promise<ResolvedMetadata> {
  const metadataItems = await resolveMetadataItems(
    tree,
    searchParams,
    errorConvention,
    interpolatedParams
  )
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError('Expected workStore to be initialized')
  }
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
  interpolatedParams: Params
): Promise<ResolvedViewport> {
  const viewportItems = await resolveViewportItems(
    tree,
    searchParams,
    errorConvention,
    interpolatedParams
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
