import type {
  Metadata,
  MetadataSelection,
  MetadataSelectionHandle,
  MetadataSelector,
  MetadataSelectorResult,
  ResolvedMetadata,
  ResolvedViewport,
  Viewport,
  ViewportSelection,
  ViewportSelectionHandle,
  ViewportSelector,
  ViewportSelectorResult,
} from './types/metadata-interface'
import type { MetadataContext } from './types/resolvers'
import type { LoaderTree } from '../../server/lib/app-dir-module'
import type { ParsedUrlQuery } from 'querystring'
import type { StaticMetadata } from './types/icons'
import type { Params } from '../../server/request/params'
import type { IconDescriptor } from './types/metadata-types'
// eslint-disable-next-line import/no-extraneous-dependencies
import 'server-only'

import {
  createDefaultMetadata,
  createDefaultViewport,
} from './default-metadata'
import { getSegmentParam } from '../../shared/lib/router/utils/get-segment-param'
import {
  getComponentTypeModule,
  getLayoutOrPageModule,
} from '../../server/lib/app-dir-module'
import { createServerParamsForMetadata } from '../../server/request/params'
import { DEFAULT_SEGMENT_KEY, PAGE_SEGMENT_KEY } from '../../shared/lib/segment'
import { PARALLEL_ROUTE_DEFAULT_PATH } from '../../client/components/builtin/default'
import { PARALLEL_ROUTE_DEFAULT_NULL_PATH } from '../../client/components/builtin/default-null'
import { workAsyncStorage } from '../../server/app-render/work-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import * as Log from '../../build/output/log'
import { getUseCacheFunctionInfo } from '../client-and-server-references'
import { createLazyResult } from '../../server/lib/lazy-result'
import {
  getAccessFallbackErrorTypeByStatus,
  getAccessFallbackHTTPStatus,
  isHTTPAccessFallbackError,
} from '../../client/components/http-access-fallback/http-access-fallback'
import { isRedirectError } from '../../client/components/redirect-error'
import {
  type BuildState,
  type InstrumentedResolver,
  type MetadataErrorType,
  type MetadataResolver,
  type SegmentProps,
  type SelectedMetadata,
  type StaticIcons,
  type TitleTemplates,
  type ViewportResolver,
  convertUrlsToStrings,
  createSelectedMetadata,
  getDefinedMetadata,
  getDefinedViewport,
  isFavicon,
  mergeMetadata,
  mergeViewport,
  postProcessMetadata,
  resolveStaticMetadata,
} from './metadata-resolution-primitives'

const METADATA = 0b01 as const
const VIEWPORT = 0b10 as const
const METADATA_AND_VIEWPORT = 0b11 as const

type ResolutionTarget =
  | typeof METADATA
  | typeof VIEWPORT
  | typeof METADATA_AND_VIEWPORT

type RejectedMetadataResolutionStatus = MetadataErrorType | 'redirect' | 'error'

type ResolvedOutcome<T> = {
  status: 'resolved'
  value: T
}

type RejectedOutcome = {
  status: RejectedMetadataResolutionStatus
  reason: unknown
}

type ResolutionOutcome<T> = ResolvedOutcome<T> | RejectedOutcome

type MetadataBranchOutcome =
  | (ResolvedOutcome<SelectedMetadata | undefined> & {
      warnings: Set<string>
    })
  | RejectedOutcome
type ViewportBranchOutcome = ResolutionOutcome<ResolvedViewport | undefined>

type MetadataResolution = {
  selectedMetadataKeyPath: string[]
  selectedViewportKeyPath: string[]
  selectedMetadata: Promise<MetadataBranchOutcome>
  selectedViewport: Promise<ViewportBranchOutcome>
  outlets: Map<LoaderTree, Promise<null>>
}

type MetadataAccumulator = {
  metadata: ResolvedMetadata
  titleTemplates: TitleTemplates
  favicon: IconDescriptor | null
  leafSegmentStaticIcons: StaticIcons
  buildState: BuildState
}

// Keep viewport state in an accumulator so its layer and fork handling stays
// structurally parallel to metadata, even though it currently has one field.
type ViewportAccumulator = {
  viewport: ResolvedViewport
}

type MetadataLayer = {
  metadata: Metadata | MetadataResolver | null
  viewport: Viewport | ViewportResolver | null
  staticFilesMetadata: Promise<StaticMetadata>
  hasStaticFilesMetadata: boolean
}

type MetadataBranch = {
  metadata: SelectedMetadataBranch | Promise<SelectedMetadataBranch>
  viewport: SelectedViewportBranch | Promise<SelectedViewportBranch>
  outletScope: MetadataOutletScope
  keyPath: string[]
  definitionDepth: number
  isBuiltinFallback: boolean
}

// Keep the fork structure so selector failures can be added to every
// descendant outlet without flattening and repeatedly copying leaf arrays.
type MetadataOutletScope = {
  tree: LoaderTree | null
  branches: MetadataOutletScope[] | null
}

type SelectedMetadataBranch = {
  outcome: Promise<MetadataBranchOutcome>
  keyPath: string[]
  definitionDepth: number
  isBuiltinFallback: boolean
}

type SelectedViewportBranch = {
  outcome: Promise<ViewportBranchOutcome>
  keyPath: string[]
  definitionDepth: number
  isBuiltinFallback: boolean
}

type CollectedMetadata = MetadataLayer & {
  errorLayer: MetadataLayer | null
  metadataSelector: MetadataSelector | null
  viewportSelector: ViewportSelector | null
}

async function collectMetadataAndViewport({
  tree,
  props,
  route,
  errorConvention,
  resolutionTarget,
}: {
  tree: LoaderTree
  props: SegmentProps
  route: string
  errorConvention: MetadataErrorType | undefined
  resolutionTarget: ResolutionTarget
}): Promise<CollectedMetadata> {
  const shouldResolveMetadata = Boolean(resolutionTarget & METADATA)
  const shouldResolveViewport = Boolean(resolutionTarget & VIEWPORT)
  const moduleResultPromise = errorConvention
    ? getComponentTypeModule(tree, 'layout').then((mod) => ({
        mod,
        modType: errorConvention,
      }))
    : getLayoutOrPageModule(tree)
  const staticFilesMetadata = shouldResolveMetadata
    ? resolveStaticMetadata(tree[2], props)
    : Promise.resolve(null)

  // Static metadata is resolved eagerly, but its rejection belongs to this
  // branch and will be replayed through the branch's metadata outlet.
  staticFilesMetadata.catch(() => null)

  const moduleResult = await moduleResultPromise
  const hasStaticFilesMetadata =
    shouldResolveMetadata && hasStaticMetadataFiles(tree)

  if (moduleResult.modType) {
    route += `/${moduleResult.modType}`
  }

  const metadata =
    shouldResolveMetadata && moduleResult.mod
      ? getDefinedMetadata(moduleResult.mod, props, { route })
      : null
  const viewport =
    shouldResolveViewport && moduleResult.mod
      ? getDefinedViewport(moduleResult.mod, props, { route })
      : null
  const metadataSelector =
    moduleResult.modType === 'layout' &&
    typeof moduleResult.mod?.unstable_selectMetadata === 'function'
      ? (moduleResult.mod.unstable_selectMetadata as MetadataSelector)
      : null
  const viewportSelector =
    moduleResult.modType === 'layout' &&
    typeof moduleResult.mod?.unstable_selectViewport === 'function'
      ? (moduleResult.mod.unstable_selectViewport as ViewportSelector)
      : null

  let errorLayer: MetadataLayer | null = null
  if (errorConvention && tree[2][errorConvention]) {
    const errorMod = await getComponentTypeModule(tree, errorConvention)
    errorLayer = {
      metadata:
        shouldResolveMetadata && errorMod
          ? getDefinedMetadata(errorMod, props, { route })
          : null,
      viewport:
        shouldResolveViewport && errorMod
          ? getDefinedViewport(errorMod, props, { route })
          : null,
      staticFilesMetadata,
      hasStaticFilesMetadata,
    }
  }

  return {
    metadata,
    viewport,
    staticFilesMetadata,
    hasStaticFilesMetadata,
    errorLayer,
    metadataSelector,
    viewportSelector,
  }
}

type Result<T> = null | T | Promise<null | T> | PromiseLike<null | T>
type PrerenderedResult<TData extends object, TResolved> = {
  resolveParent: ((value: TResolved) => void) | null
  result: Result<TData>
}

function callResolver<T>(resolver: () => T | Promise<T>): T | Promise<T> {
  let result: T | Promise<T>
  try {
    result = resolver()
  } catch (error) {
    result = Promise.reject(error)
  }

  if (result instanceof Promise) {
    // Generators are eagerly executed, so attach a rejection handler before
    // an earlier layer can suspend or fail.
    result.catch(() => null)
  }
  return result
}

function getResult<TData extends object, TResolved>(
  exportForResult: null | TData | InstrumentedResolver<TData, TResolved>
): PrerenderedResult<TData, TResolved> {
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
    if (useCacheFunctionInfo && !useCacheFunctionInfo.usedArgs[1]) {
      return {
        resolveParent: null,
        result: callResolver(() => {
          // @ts-expect-error We intentionally omit the parent argument, because
          // we know this 'use cache' function does not use it.
          return exportForResult()
        }),
      }
    }

    let resolveParent: (value: TResolved) => void
    const parent = new Promise<TResolved>((resolve) => {
      resolveParent = resolve
    })
    return {
      resolveParent: resolveParent!,
      result: useCacheFunctionInfo
        ? createLazyResult(() => exportForResult(parent))
        : callResolver(() => exportForResult(parent)),
    }
  }

  return {
    resolveParent: null,
    result: typeof exportForResult === 'object' ? exportForResult : null,
  }
}

function resolveParentResult<T extends object>(
  parentResult: T,
  resolveParent: (value: T) => void
): void {
  if (process.env.NODE_ENV === 'development') {
    parentResult = (
      require('../../shared/lib/deep-freeze') as typeof import('../../shared/lib/deep-freeze')
    ).deepFreeze(structuredClone(parentResult)) as T
  }

  resolveParent(parentResult)
}

function cloneStaticMetadata(metadata: StaticMetadata): StaticMetadata {
  if (!metadata) return null

  return {
    ...metadata,
    icon: metadata.icon ? [...metadata.icon] : undefined,
    apple: metadata.apple ? [...metadata.apple] : undefined,
    openGraph: metadata.openGraph ? [...metadata.openGraph] : undefined,
    twitter: metadata.twitter ? [...metadata.twitter] : undefined,
  }
}

function createMetadataAccumulator(): MetadataAccumulator {
  return {
    metadata: createDefaultMetadata(),
    titleTemplates: {
      title: null,
      twitter: null,
      openGraph: null,
    },
    favicon: null,
    leafSegmentStaticIcons: {
      icon: [],
      apple: [],
    },
    buildState: {
      warnings: new Set<string>(),
    },
  }
}

function cloneMetadataAccumulator(
  accumulator: MetadataAccumulator
): MetadataAccumulator {
  return {
    metadata: structuredClone(accumulator.metadata),
    titleTemplates: { ...accumulator.titleTemplates },
    favicon: accumulator.favicon ? structuredClone(accumulator.favicon) : null,
    leafSegmentStaticIcons: {
      icon: structuredClone(accumulator.leafSegmentStaticIcons.icon),
      apple: structuredClone(accumulator.leafSegmentStaticIcons.apple),
    },
    buildState: {
      warnings: new Set(accumulator.buildState.warnings),
    },
  }
}

function cloneViewportAccumulator(
  accumulator: ViewportAccumulator
): ViewportAccumulator {
  return {
    viewport: structuredClone(accumulator.viewport),
  }
}

async function accumulateMetadataLayer(
  parent: Promise<MetadataAccumulator>,
  prerendered: PrerenderedResult<Metadata, ResolvedMetadata>,
  staticMetadata: Promise<StaticMetadata>,
  route: string,
  layerIndex: number,
  pathname: Promise<string>,
  metadataContext: MetadataContext
): Promise<MetadataAccumulator> {
  const accumulator = await parent
  const staticFilesMetadata = cloneStaticMetadata(await staticMetadata)

  // Treat favicon as a special case. It should be the first icon in the list.
  // layerIndex <= 1 represents the root layout and a page at the root.
  if (layerIndex <= 1 && isFavicon(staticFilesMetadata?.icon?.[0])) {
    const icon = staticFilesMetadata?.icon?.shift()
    if (layerIndex === 0 && icon) {
      accumulator.favicon = convertUrlsToStrings(icon)
    }
  }

  if (prerendered.resolveParent) {
    resolveParentResult(accumulator.metadata, prerendered.resolveParent)
  }

  let metadata: Metadata | null
  if (isPromiseLike(prerendered.result)) {
    metadata = await prerendered.result
  } else {
    metadata = prerendered.result
  }

  await mergeMetadata(
    route,
    pathname,
    {
      metadata,
      resolvedMetadata: accumulator.metadata,
      staticFilesMetadata,
      titleTemplates: accumulator.titleTemplates,
      metadataContext,
      buildState: accumulator.buildState,
      leafSegmentStaticIcons: accumulator.leafSegmentStaticIcons,
    },
    false
  )

  return accumulator
}

async function accumulateViewportLayer(
  parent: Promise<ViewportAccumulator>,
  prerendered: PrerenderedResult<Viewport, ResolvedViewport>
): Promise<ViewportAccumulator> {
  const accumulator = await parent

  if (prerendered.resolveParent) {
    resolveParentResult(accumulator.viewport, prerendered.resolveParent)
  }

  let viewport: Viewport | null
  if (isPromiseLike(prerendered.result)) {
    viewport = await prerendered.result
  } else {
    viewport = prerendered.result
  }

  mergeViewport({ resolvedViewport: accumulator.viewport, viewport }, false)
  return accumulator
}

function prepareMetadataAccumulatorForChild(
  parent: Promise<MetadataAccumulator>,
  clone: boolean,
  childIsPage: boolean,
  errorConvention: MetadataErrorType | undefined
): Promise<MetadataAccumulator> {
  return parent.then((parentAccumulator) => {
    const accumulator = clone
      ? cloneMetadataAccumulator(parentAccumulator)
      : parentAccumulator

    // A title template applies to a descendant segment, but not to a page in
    // the same segment. Error convention metadata is an additional terminal
    // layer, so the leaf layout's template does apply to it.
    if (!childIsPage || errorConvention) {
      accumulator.titleTemplates = {
        title: accumulator.metadata.title?.template || null,
        openGraph: accumulator.metadata.openGraph?.title.template || null,
        twitter: accumulator.metadata.twitter?.title.template || null,
      }
    }

    return accumulator
  })
}

function prepareViewportAccumulatorForChild(
  parent: Promise<ViewportAccumulator>,
  clone: boolean
): Promise<ViewportAccumulator> {
  return clone ? parent.then(cloneViewportAccumulator) : parent
}

function completeMetadataAccumulator(
  accumulator: MetadataAccumulator,
  metadataContext: MetadataContext
): ResolvedMetadata {
  const { leafSegmentStaticIcons, metadata } = accumulator

  if (
    (leafSegmentStaticIcons.icon.length > 0 ||
      leafSegmentStaticIcons.apple.length > 0) &&
    !metadata.icons
  ) {
    metadata.icons = {
      icon: [],
      apple: [],
    }
    if (leafSegmentStaticIcons.icon.length > 0) {
      metadata.icons.icon.unshift(
        ...convertUrlsToStrings(leafSegmentStaticIcons.icon)
      )
    }
    if (leafSegmentStaticIcons.apple.length > 0) {
      metadata.icons.apple.unshift(
        ...convertUrlsToStrings(leafSegmentStaticIcons.apple)
      )
    }
  }

  return postProcessMetadata(
    metadata,
    accumulator.favicon,
    accumulator.titleTemplates,
    metadataContext
  )
}

type MetadataTreeContext = {
  pathname: Promise<string>
  searchParams: Promise<ParsedUrlQuery>
  errorConvention: MetadataErrorType | undefined
  interpolatedParams: Params
  metadataContext: MetadataContext
  route: string
  selectedKeyPath: string[] | null
  resolutionTarget: ResolutionTarget
  outlets: Map<LoaderTree, Promise<null>>
}

type MetadataTreeState = {
  tree: LoaderTree
  treeRoute: string | null
  parentParams: Params
  parentOptionalCatchAllParamName: string | null
  metadataParent: Promise<MetadataAccumulator>
  viewportParent: Promise<ViewportAccumulator>
  errorLayer: MetadataLayer | null
  metadataSelector: MetadataSelector | null
  viewportSelector: ViewportSelector | null
  definitionDepth: number
  keyPath: string[]
}

type SelectableBranch = {
  keyPath: string[]
  definitionDepth: number
  isBuiltinFallback: boolean
}

type BranchAtFork<T extends SelectableBranch> = {
  key: string
  branch: T
}

type MetadataBranchAtFork = BranchAtFork<MetadataBranch>

function getResolutionStatus(
  reason: unknown
): RejectedMetadataResolutionStatus {
  if (isHTTPAccessFallbackError(reason)) {
    return (
      getAccessFallbackErrorTypeByStatus(getAccessFallbackHTTPStatus(reason)) ||
      'error'
    )
  }
  if (isRedirectError(reason)) {
    return 'redirect'
  }
  return 'error'
}

function createRejectedOutcome(reason: unknown): RejectedOutcome {
  return {
    status: getResolutionStatus(reason),
    reason,
  }
}

function createMetadataBranchOutcome(
  pendingAccumulator: Promise<MetadataAccumulator>,
  metadataContext: MetadataContext
): Promise<MetadataBranchOutcome> {
  const completed = pendingAccumulator.then((accumulator) => ({
    value: createSelectedMetadata(
      completeMetadataAccumulator(accumulator, metadataContext)
    ),
    warnings: accumulator.buildState.warnings,
  }))

  return completed.then(
    ({ value, warnings }) => ({
      status: 'resolved',
      value,
      warnings,
    }),
    createRejectedOutcome
  )
}

function createViewportBranchOutcome(
  pendingAccumulator: Promise<ViewportAccumulator>
): Promise<ViewportBranchOutcome> {
  return pendingAccumulator.then(
    (accumulator) => ({
      status: 'resolved',
      value: accumulator.viewport,
    }),
    createRejectedOutcome
  )
}

function createOutletPromise(
  metadataOutcome: Promise<MetadataBranchOutcome>,
  viewportOutcome: Promise<ViewportBranchOutcome>
): Promise<null> {
  let pendingOutcomes = 2
  const outlet = new Promise<null>((resolve, reject) => {
    function settle(outcome: ResolutionOutcome<unknown>) {
      if (outcome.status !== 'resolved') {
        reject(outcome.reason)
      } else if (--pendingOutcomes === 0) {
        resolve(null)
      }
    }

    metadataOutcome.then(settle, reject)
    viewportOutcome.then(settle, reject)
  })

  // Outlet promises can reject before React renders the corresponding slot.
  // Observe the rejection immediately while preserving it for React to replay.
  outlet.catch(() => null)
  return outlet
}

function combineOutletPromises(
  first: Promise<null>,
  second: Promise<null>
): Promise<null> {
  let pending = 2
  const combined = new Promise<null>((resolve, reject) => {
    function settle() {
      if (--pending === 0) resolve(null)
    }

    first.then(settle, reject)
    second.then(settle, reject)
  })
  combined.catch(() => null)
  return combined
}

function attachOutletPromise(
  scope: MetadataOutletScope,
  additional: Promise<null>,
  outlets: Map<LoaderTree, Promise<null>>
): void {
  if (scope.tree !== null) {
    const outlet = outlets.get(scope.tree)
    if (outlet) {
      outlets.set(scope.tree, combineOutletPromises(outlet, additional))
    }
    return
  }

  const branches = scope.branches
  if (branches) {
    for (const branch of branches) {
      attachOutletPromise(branch, additional, outlets)
    }
  }
}

function appendTreeRoute(
  parentRoute: string | null,
  segment: string
): string | null {
  if (segment === PAGE_SEGMENT_KEY) return parentRoute
  if (parentRoute === null) return segment
  return `${parentRoute}/${segment}`
}

function isPageTree(tree: LoaderTree): boolean {
  const { layout, page, defaultPage } = tree[2]
  return (
    layout === undefined &&
    (page !== undefined ||
      (defaultPage !== undefined && tree[0] === DEFAULT_SEGMENT_KEY))
  )
}

function isBuiltinFallback(tree: LoaderTree): boolean {
  const { defaultPage } = tree[2]
  return (
    defaultPage?.[1].endsWith(PARALLEL_ROUTE_DEFAULT_PATH) === true ||
    defaultPage?.[1].endsWith(PARALLEL_ROUTE_DEFAULT_NULL_PATH) === true
  )
}

function hasHeadDefinition(layer: MetadataLayer | null): boolean {
  if (layer === null) return false

  return (
    layer.metadata !== null ||
    layer.viewport !== null ||
    layer.hasStaticFilesMetadata
  )
}

function hasStaticMetadataFiles(tree: LoaderTree): boolean {
  const metadata = tree[2].metadata
  return Boolean(
    metadata &&
      ((metadata.icon?.length ?? 0) > 0 ||
        (metadata.apple?.length ?? 0) > 0 ||
        (metadata.openGraph?.length ?? 0) > 0 ||
        (metadata.twitter?.length ?? 0) > 0 ||
        metadata.manifest !== undefined)
  )
}

function selectDefaultMetadataBranch<T extends SelectableBranch>(
  branches: Array<BranchAtFork<T>>,
  forkDepth: number
): T {
  if (branches.length === 0) {
    throw new InvariantError('Expected at least one metadata branch')
  }

  let selected = branches[0]
  for (let i = 1; i < branches.length; i++) {
    const candidate = branches[i]
    if (
      selected.branch.isBuiltinFallback !== candidate.branch.isBuiltinFallback
    ) {
      if (!candidate.branch.isBuiltinFallback) {
        selected = candidate
      }
      continue
    }

    const selectedIsChildren = selected.key === 'children'
    const candidateIsChildren = candidate.key === 'children'
    if (selectedIsChildren !== candidateIsChildren) {
      const childrenBranch = selectedIsChildren ? selected : candidate
      const namedBranch = selectedIsChildren ? candidate : selected
      const childrenDefinesHead =
        childrenBranch.branch.definitionDepth > forkDepth
      const namedDefinesHead = namedBranch.branch.definitionDepth > forkDepth

      // Prefer children when it contributes to the head. Otherwise, allow a
      // named slot with its own definition to provide the selected metadata.
      selected =
        childrenDefinesHead || !namedDefinesHead ? childrenBranch : namedBranch
      continue
    }

    if (candidate.branch.definitionDepth > selected.branch.definitionDepth) {
      selected = candidate
      continue
    }
    if (candidate.branch.definitionDepth < selected.branch.definitionDepth) {
      continue
    }
    const selectedDepth = selected.branch.keyPath.length
    const candidateDepth = candidate.branch.keyPath.length
    if (candidateDepth > selectedDepth) {
      selected = candidate
      continue
    }
    if (candidateDepth === selectedDepth && candidate.key < selected.key) {
      selected = candidate
    }
  }

  return selected.branch
}

function isPendingSelection<T>(
  selection: T | Promise<T>
): selection is Promise<T> {
  return typeof (selection as Promise<T>).then === 'function'
}

function selectDefaultResolvedMetadataBranch(
  branches: MetadataBranchAtFork[],
  forkDepth: number
): SelectedMetadataBranch | Promise<SelectedMetadataBranch> {
  if (branches.some(({ branch }) => isPendingSelection(branch.metadata))) {
    return Promise.all(
      branches.map(async ({ key, branch }) => ({
        key,
        branch: await branch.metadata,
      }))
    ).then((resolvedBranches) =>
      selectDefaultMetadataBranch(resolvedBranches, forkDepth)
    )
  }

  const resolvedBranches: Array<BranchAtFork<SelectedMetadataBranch>> = []
  for (const { key, branch } of branches) {
    resolvedBranches.push({
      key,
      branch: branch.metadata as SelectedMetadataBranch,
    })
  }
  return selectDefaultMetadataBranch(resolvedBranches, forkDepth)
}

function selectDefaultResolvedViewportBranch(
  branches: MetadataBranchAtFork[],
  forkDepth: number
): SelectedViewportBranch | Promise<SelectedViewportBranch> {
  if (branches.some(({ branch }) => isPendingSelection(branch.viewport))) {
    return Promise.all(
      branches.map(async ({ key, branch }) => ({
        key,
        branch: await branch.viewport,
      }))
    ).then((resolvedBranches) =>
      selectDefaultMetadataBranch(resolvedBranches, forkDepth)
    )
  }

  const resolvedBranches: Array<BranchAtFork<SelectedViewportBranch>> = []
  for (const { key, branch } of branches) {
    resolvedBranches.push({
      key,
      branch: branch.viewport as SelectedViewportBranch,
    })
  }
  return selectDefaultMetadataBranch(resolvedBranches, forkDepth)
}

function createMetadataSelection(
  outcome: MetadataBranchOutcome
): MetadataSelection {
  if (outcome.status === 'resolved') {
    return {
      status: 'resolved',
      value: outcome.value,
    }
  }
  return {
    status: outcome.status,
    reason: outcome.reason,
  }
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function isMetadataSelection(value: unknown): value is MetadataSelection {
  if (!isObject(value) || !('status' in value)) return false

  switch (value.status) {
    case 'resolved':
    case 'not-found':
    case 'forbidden':
    case 'unauthorized':
    case 'redirect':
    case 'error':
      return true
    default:
      return false
  }
}

function createUserSelectedMetadataBranch(
  result: SelectedMetadata | MetadataSelection,
  fallback: SelectedMetadataBranch,
  definitionDepth: number
): SelectedMetadataBranch {
  let outcome: MetadataBranchOutcome
  if (isMetadataSelection(result)) {
    outcome =
      result.status === 'resolved'
        ? {
            status: 'resolved',
            value: result.value,
            warnings: new Set<string>(),
          }
        : {
            status: result.status,
            reason: result.reason,
          }
  } else {
    outcome = {
      status: 'resolved',
      value: result,
      warnings: new Set<string>(),
    }
  }

  return {
    outcome: Promise.resolve(outcome),
    keyPath: fallback.keyPath,
    definitionDepth,
    isBuiltinFallback: false,
  }
}

function selectMetadataBranchWithUserlandSelector(
  selector: MetadataSelector,
  branches: MetadataBranchAtFork[],
  fallback: Promise<SelectedMetadataBranch>,
  definitionDepth: number,
  outletScope: MetadataOutletScope,
  outlets: Map<LoaderTree, Promise<null>>
): Promise<SelectedMetadataBranch> {
  const handles: Record<string, MetadataSelectionHandle> = {}
  // Preserve branch identity when userland returns a provided handle, its
  // resolved outcome, or the SelectedMetadata value from that outcome.
  const branchByHandle = new WeakMap<object, Promise<SelectedMetadataBranch>>()
  const branchByResult = new WeakMap<object, SelectedMetadataBranch>()

  for (const { key, branch } of branches) {
    const pendingBranch = Promise.resolve(branch.metadata)
    const handle = pendingBranch.then(async (selectedBranch) => {
      const result = createMetadataSelection(await selectedBranch.outcome)
      branchByResult.set(result, selectedBranch)
      if (result.status === 'resolved' && isObject(result.value)) {
        branchByResult.set(result.value, selectedBranch)
      }
      return result
    })
    handles[key] = handle
    branchByHandle.set(handle, pendingBranch)
  }

  let result: MetadataSelectorResult
  try {
    result = selector(handles)
  } catch (reason) {
    result = Promise.reject(reason)
  }

  if (isObject(result)) {
    const selectedBranch = branchByHandle.get(result)
    if (selectedBranch) return selectedBranch
  }

  const normalized = Promise.resolve(result).then(async (resolvedResult) => {
    if (!isObject(resolvedResult)) {
      throw new InvariantError(
        'Expected unstable_selectMetadata to return a metadata handle, selection, or SelectedMetadata object'
      )
    }

    const selectedBranch = branchByResult.get(resolvedResult)
    if (selectedBranch) return selectedBranch

    return createUserSelectedMetadataBranch(
      resolvedResult,
      await fallback,
      definitionDepth
    )
  })

  const selectorOutlet = normalized.then(() => null)
  // A selector is associated with the fork rather than one slot. Add its
  // failure to every descendant outlet so whichever slots render can replay
  // it through their normal error or navigation handling.
  attachOutletPromise(outletScope, selectorOutlet, outlets)

  return normalized.catch(async (reason) => {
    const fallbackBranch = await fallback
    return {
      outcome: Promise.resolve(createRejectedOutcome(reason)),
      keyPath: fallbackBranch.keyPath,
      definitionDepth,
      isBuiltinFallback: false,
    }
  })
}

function createViewportSelection(
  outcome: ViewportBranchOutcome
): ViewportSelection {
  if (outcome.status === 'resolved') {
    return {
      status: 'resolved',
      value: outcome.value,
    }
  }
  return {
    status: outcome.status,
    reason: outcome.reason,
  }
}

function isViewportSelection(value: unknown): value is ViewportSelection {
  if (!isObject(value) || !('status' in value)) return false

  switch (value.status) {
    case 'resolved':
    case 'not-found':
    case 'forbidden':
    case 'unauthorized':
    case 'redirect':
    case 'error':
      return true
    default:
      return false
  }
}

function createUserSelectedViewportBranch(
  result: ResolvedViewport | ViewportSelection,
  fallback: SelectedViewportBranch,
  definitionDepth: number
): SelectedViewportBranch {
  let outcome: ViewportBranchOutcome
  if (isViewportSelection(result)) {
    outcome =
      result.status === 'resolved'
        ? {
            status: 'resolved',
            value: result.value,
          }
        : {
            status: result.status,
            reason: result.reason,
          }
  } else {
    outcome = {
      status: 'resolved',
      value: result,
    }
  }

  return {
    outcome: Promise.resolve(outcome),
    keyPath: fallback.keyPath,
    definitionDepth,
    isBuiltinFallback: false,
  }
}

function selectViewportBranchWithUserlandSelector(
  selector: ViewportSelector,
  branches: MetadataBranchAtFork[],
  fallback: Promise<SelectedViewportBranch>,
  definitionDepth: number,
  outletScope: MetadataOutletScope,
  outlets: Map<LoaderTree, Promise<null>>
): Promise<SelectedViewportBranch> {
  const handles: Record<string, ViewportSelectionHandle> = {}
  // Preserve branch identity when userland returns a provided handle, its
  // resolved outcome, or the ResolvedViewport value from that outcome.
  const branchByHandle = new WeakMap<object, Promise<SelectedViewportBranch>>()
  const branchByResult = new WeakMap<object, SelectedViewportBranch>()

  for (const { key, branch } of branches) {
    const pendingBranch = Promise.resolve(branch.viewport)
    const handle = pendingBranch.then(async (selectedBranch) => {
      const result = createViewportSelection(await selectedBranch.outcome)
      branchByResult.set(result, selectedBranch)
      if (result.status === 'resolved' && isObject(result.value)) {
        branchByResult.set(result.value, selectedBranch)
      }
      return result
    })
    handles[key] = handle
    branchByHandle.set(handle, pendingBranch)
  }

  let result: ViewportSelectorResult
  try {
    result = selector(handles)
  } catch (reason) {
    result = Promise.reject(reason)
  }

  if (isObject(result)) {
    const selectedBranch = branchByHandle.get(result)
    if (selectedBranch) return selectedBranch
  }

  const normalized = Promise.resolve(result).then(async (resolvedResult) => {
    if (!isObject(resolvedResult)) {
      throw new InvariantError(
        'Expected unstable_selectViewport to return a viewport handle, selection, or ResolvedViewport object'
      )
    }

    const selectedBranch = branchByResult.get(resolvedResult)
    if (selectedBranch) return selectedBranch

    return createUserSelectedViewportBranch(
      resolvedResult,
      await fallback,
      definitionDepth
    )
  })

  const selectorOutlet = normalized.then(() => null)
  // A selector is associated with the fork rather than one slot. Add its
  // failure to every descendant outlet so whichever slots render can replay
  // it through their normal error or navigation handling.
  attachOutletPromise(outletScope, selectorOutlet, outlets)

  return normalized.catch(async (reason) => {
    const fallbackBranch = await fallback
    return {
      outcome: Promise.resolve(createRejectedOutcome(reason)),
      keyPath: fallbackBranch.keyPath,
      definitionDepth,
      isBuiltinFallback: false,
    }
  })
}

async function walkMetadataTree(
  context: MetadataTreeContext,
  state: MetadataTreeState
): Promise<MetadataBranch> {
  const [segment, parallelRoutes, { page }] = state.tree
  const treeRoute = appendTreeRoute(state.treeRoute, segment)
  const isPage = page !== undefined
  const depth = state.keyPath.length
  const shouldResolveMetadata = Boolean(context.resolutionTarget & METADATA)
  const shouldResolveViewport = Boolean(context.resolutionTarget & VIEWPORT)

  let currentParams = state.parentParams
  const segmentParam = getSegmentParam(segment)
  if (segmentParam) {
    const value = context.interpolatedParams[segmentParam.paramName]
    if (value !== null && value !== undefined) {
      currentParams = {
        ...state.parentParams,
        [segmentParam.paramName]: value,
      }
    }
  }

  const optionalCatchAllParamName: string | null =
    segmentParam?.paramType === 'optional-catchall' &&
    (context.interpolatedParams[segmentParam.paramName] === null ||
      context.interpolatedParams[segmentParam.paramName] === undefined)
      ? segmentParam.paramName
      : state.parentOptionalCatchAllParamName

  const params = createServerParamsForMetadata(
    currentParams,
    optionalCatchAllParamName
  )
  const props: SegmentProps = isPage
    ? { params, searchParams: context.searchParams }
    : { params }
  const layer = await collectMetadataAndViewport({
    tree: state.tree,
    props,
    route: treeRoute ?? '',
    errorConvention: context.errorConvention,
    resolutionTarget: context.resolutionTarget,
  })
  // The closest selector above a fork wins. Once a fork is reached it is
  // consumed, and each branch starts looking for the selector for its next
  // nested fork.
  const metadataSelector = layer.metadataSelector || state.metadataSelector
  const viewportSelector = layer.viewportSelector || state.viewportSelector
  let definitionDepth = hasHeadDefinition(layer) ? depth : state.definitionDepth

  // Invoke each active generator as soon as this layer is discovered. Its
  // parent promise is resolved later when the preceding accumulator is ready.
  let metadata = state.metadataParent
  if (shouldResolveMetadata) {
    const prerenderedMetadata = getResult<Metadata, ResolvedMetadata>(
      layer.metadata
    )
    metadata = accumulateMetadataLayer(
      metadata,
      prerenderedMetadata,
      layer.staticFilesMetadata,
      context.route,
      depth,
      context.pathname,
      context.metadataContext
    )
  }
  let viewport = state.viewportParent
  if (shouldResolveViewport) {
    const prerenderedViewport = getResult<Viewport, ResolvedViewport>(
      layer.viewport
    )
    viewport = accumulateViewportLayer(viewport, prerenderedViewport)
  }
  const errorLayer = layer.errorLayer || state.errorLayer

  let parallelRouteKeys = Object.keys(parallelRoutes)
  if (context.selectedKeyPath !== null) {
    const selectedKey = context.selectedKeyPath[depth]
    if (parallelRouteKeys.length === 0) {
      if (selectedKey !== undefined) {
        throw new InvariantError(
          'Expected selected metadata branch to end at a leaf'
        )
      }
    } else {
      if (selectedKey === undefined || !parallelRoutes[selectedKey]) {
        throw new InvariantError(
          'Expected selected metadata branch to match loader tree'
        )
      }
      parallelRouteKeys = [selectedKey]
    }
  }

  if (parallelRouteKeys.length === 0) {
    if (context.errorConvention) {
      if (hasHeadDefinition(errorLayer)) {
        definitionDepth = depth + 1
      }
      if (shouldResolveMetadata) {
        const errorMetadata = getResult<Metadata, ResolvedMetadata>(
          errorLayer?.metadata || null
        )
        metadata = accumulateMetadataLayer(
          metadata,
          errorMetadata,
          errorLayer?.staticFilesMetadata || Promise.resolve(null),
          context.route,
          depth + 1,
          context.pathname,
          context.metadataContext
        )
      }
      if (shouldResolveViewport) {
        const errorViewport = getResult<Viewport, ResolvedViewport>(
          errorLayer?.viewport || null
        )
        viewport = accumulateViewportLayer(viewport, errorViewport)
      }
    }

    const metadataOutcome = createMetadataBranchOutcome(
      metadata,
      context.metadataContext
    )
    const viewportOutcome = createViewportBranchOutcome(viewport)
    context.outlets.set(
      state.tree,
      createOutletPromise(metadataOutcome, viewportOutcome)
    )
    const branchProperties = {
      keyPath: state.keyPath,
      definitionDepth,
      isBuiltinFallback: isBuiltinFallback(state.tree),
    }
    return {
      metadata: {
        outcome: metadataOutcome,
        ...branchProperties,
      },
      viewport: {
        outcome: viewportOutcome,
        ...branchProperties,
      },
      outletScope: {
        tree: state.tree,
        branches: null,
      },
      ...branchProperties,
    }
  }

  const cloneAtFork = parallelRouteKeys.length > 1
  const pendingChildBranches: Array<{
    key: string
    branch: Promise<MetadataBranch>
  }> = []
  for (const parallelRouteKey of parallelRouteKeys) {
    const childTree = parallelRoutes[parallelRouteKey]
    const childKeyPath = [...state.keyPath, parallelRouteKey]
    pendingChildBranches.push({
      key: parallelRouteKey,
      branch: walkMetadataTree(context, {
        tree: childTree,
        treeRoute,
        parentParams: currentParams,
        parentOptionalCatchAllParamName: optionalCatchAllParamName,
        metadataParent: prepareMetadataAccumulatorForChild(
          metadata,
          cloneAtFork && shouldResolveMetadata,
          isPageTree(childTree),
          context.errorConvention
        ),
        viewportParent: prepareViewportAccumulatorForChild(
          viewport,
          cloneAtFork && shouldResolveViewport
        ),
        errorLayer,
        metadataSelector: cloneAtFork ? null : metadataSelector,
        viewportSelector: cloneAtFork ? null : viewportSelector,
        definitionDepth,
        keyPath: childKeyPath,
      }),
    })
  }

  const childBranches: MetadataBranchAtFork[] = []
  for (const pendingChildBranch of pendingChildBranches) {
    childBranches.push({
      key: pendingChildBranch.key,
      branch: await pendingChildBranch.branch,
    })
  }

  if (!cloneAtFork) {
    return childBranches[0].branch
  }

  const outletBranches: MetadataOutletScope[] = []
  for (const { branch } of childBranches) {
    outletBranches.push(branch.outletScope)
  }
  const outletScope: MetadataOutletScope = {
    tree: null,
    branches: outletBranches,
  }

  const selectedBranch = selectDefaultMetadataBranch(childBranches, depth)
  let selectedMetadata = selectDefaultResolvedMetadataBranch(
    childBranches,
    depth
  )
  let selectedViewport = selectDefaultResolvedViewportBranch(
    childBranches,
    depth
  )
  if (metadataSelector && cloneAtFork && shouldResolveMetadata) {
    selectedMetadata = selectMetadataBranchWithUserlandSelector(
      metadataSelector,
      childBranches,
      Promise.resolve(selectedMetadata),
      depth,
      outletScope,
      context.outlets
    )
  }
  if (viewportSelector && cloneAtFork && shouldResolveViewport) {
    selectedViewport = selectViewportBranchWithUserlandSelector(
      viewportSelector,
      childBranches,
      Promise.resolve(selectedViewport),
      depth,
      outletScope,
      context.outlets
    )
  }
  return {
    ...selectedBranch,
    outletScope,
    metadata: selectedMetadata,
    viewport: selectedViewport,
  }
}

async function resolveMetadataTree(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  interpolatedParams: Params,
  metadataContext: MetadataContext,
  selectedKeyPath: string[] | null,
  resolutionTarget: ResolutionTarget
): Promise<MetadataResolution> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError('Expected workStore to be initialized')
  }

  const outlets = new Map<LoaderTree, Promise<null>>()
  const selectedBranch = await walkMetadataTree(
    {
      pathname,
      searchParams,
      errorConvention,
      interpolatedParams,
      metadataContext,
      route: workStore.route,
      selectedKeyPath,
      resolutionTarget,
      outlets,
    },
    {
      tree,
      treeRoute: null,
      parentParams: {},
      parentOptionalCatchAllParamName: null,
      metadataParent: Promise.resolve(createMetadataAccumulator()),
      viewportParent: Promise.resolve({
        viewport: createDefaultViewport(),
      }),
      errorLayer: null,
      metadataSelector: null,
      viewportSelector: null,
      definitionDepth: -1,
      keyPath: [],
    }
  )

  const selectedMetadataBranch = isPendingSelection(selectedBranch.metadata)
    ? await selectedBranch.metadata
    : selectedBranch.metadata
  const selectedViewportBranch = isPendingSelection(selectedBranch.viewport)
    ? await selectedBranch.viewport
    : selectedBranch.viewport
  const selected = selectedMetadataBranch.outcome.then((outcome) => {
    if (outcome.status === 'resolved') {
      for (const warning of outcome.warnings) {
        Log.warn(warning)
      }
    }
    return outcome
  })

  return {
    selectedMetadataKeyPath: selectedMetadataBranch.keyPath,
    selectedViewportKeyPath: selectedViewportBranch.keyPath,
    selectedMetadata: selected,
    selectedViewport: selectedViewportBranch.outcome,
    outlets,
  }
}

export function resolveMetadataResolution(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType | undefined,
  interpolatedParams: Params,
  metadataContext: MetadataContext
): Promise<MetadataResolution> {
  return resolveMetadataTree(
    tree,
    pathname,
    searchParams,
    errorConvention,
    interpolatedParams,
    metadataContext,
    null,
    METADATA_AND_VIEWPORT
  )
}

export async function resolveMetadataForBranch(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType,
  interpolatedParams: Params,
  metadataContext: MetadataContext,
  selectedKeyPath: string[]
): Promise<MetadataBranchOutcome> {
  const resolution = await resolveMetadataTree(
    tree,
    pathname,
    searchParams,
    errorConvention,
    interpolatedParams,
    metadataContext,
    selectedKeyPath,
    METADATA
  )
  return resolution.selectedMetadata
}

export async function resolveViewportForBranch(
  tree: LoaderTree,
  pathname: Promise<string>,
  searchParams: Promise<ParsedUrlQuery>,
  errorConvention: MetadataErrorType,
  interpolatedParams: Params,
  metadataContext: MetadataContext,
  selectedKeyPath: string[]
): Promise<ViewportBranchOutcome> {
  const resolution = await resolveMetadataTree(
    tree,
    pathname,
    searchParams,
    errorConvention,
    interpolatedParams,
    metadataContext,
    selectedKeyPath,
    VIEWPORT
  )
  return resolution.selectedViewport
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
