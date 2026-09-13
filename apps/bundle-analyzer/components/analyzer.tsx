'use client'

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import useSWR from 'swr'
import {
  CompareLayout,
  type CompareLayoutModel,
} from '@/components/compare-layout'
import { DiffTable } from '@/components/diff-table'
import { ErrorState } from '@/components/error-state'
import { Sidebar } from '@/components/sidebar'
import { TopBar, Environment, CompareView } from '@/components/top-bar'
import { TreemapVisualizer } from '@/components/treemap-visualizer'

import { Badge } from '@/components/ui/badge'
import { TableSkeleton, TreemapSkeleton } from '@/components/ui/skeleton'
import { AnalyzeData, ModulesData } from '@/lib/analyze-data'
import {
  analyzeDataUrl,
  fetchAnalyzeData,
  fetchModulesData,
  useHistoryIndex,
  useSuspenseData,
} from '@/lib/analyzer-data'
import { diffRoutesWithSizes, diffSources } from '@/lib/diff'
import { useRouteTotals } from '@/lib/use-route-totals'
import { useSidebarResize } from '@/lib/use-sidebar-resize'
import { useAnalyzerRoute } from '@/lib/use-analyzer-route'
import { computeActiveEntries, computeModuleDepthMap } from '@/lib/module-graph'
import type { SnapshotMetadata } from '@/lib/snapshot'
import { jsonFetcher } from '@/lib/utils'
import { formatBytes } from '@/lib/utils'
import { SizeMode } from '@/lib/treemap-layout'

export function SingleAnalyzer() {
  return (
    <AnalyzerBoundary defaultView={CompareView.Treemap}>
      <SingleAnalyzerController />
    </AnalyzerBoundary>
  )
}

function SingleAnalyzerController() {
  const model = useAnalyzerModel(false)
  return <SingleAnalyzerView model={model} />
}

export function CompareAnalyzer() {
  return (
    <AnalyzerBoundary defaultView={CompareView.Table}>
      <CompareAnalyzerController />
    </AnalyzerBoundary>
  )
}

function CompareAnalyzerController() {
  const model = useAnalyzerModel(true)
  return <CompareAnalyzerView model={model} />
}

function AnalyzerBoundary({
  children,
  defaultView,
}: {
  children: ReactNode
  defaultView: CompareView
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <AnalyzerFallback view={defaultView} />

  return (
    <AnalyzerErrorBoundary>
      <Suspense fallback={<AnalyzerFallback view={defaultView} />}>
        {children}
      </Suspense>
    </AnalyzerErrorBoundary>
  )
}

class AnalyzerErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <main className="h-screen bg-background">
          <ErrorState error={this.state.error} />
        </main>
      )
    }
    return this.props.children
  }
}

function AnalyzerFallback({ view }: { view: CompareView }) {
  return (
    <main className="h-screen flex flex-col bg-background">
      <div className="h-14 flex-none border-b border-border" />
      <div className="flex-1 min-h-0 p-4">
        {view === CompareView.Table ? <TableSkeleton /> : <TreemapSkeleton />}
      </div>
    </main>
  )
}

function useAnalyzerModel(compare: boolean) {
  const [environmentFilter, setEnvironmentFilter] = useState<Environment>(
    Environment.Client
  )
  const [typeFilter, setTypeFilter] = useState(['js', 'css', 'json'])
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | null>(
    null
  )
  const [focusedSourceIndex, setFocusedSourceIndex] = useState<number | null>(
    null
  )

  const { data: history, isLoading: isHistoryLoading } = useHistoryIndex()
  const routeState = useAnalyzerRoute(compare, history?.snapshots)
  const { baselineSnapshot, comparisonSnapshot, compareView, selectedRoute } =
    routeState
  const [pendingView, setPendingView] = useState<CompareView | null>(null)

  useEffect(() => {
    if (pendingView === compareView) setPendingView(null)
  }, [compareView, pendingView])

  const activeView = pendingView ?? compareView
  const isViewPending = pendingView != null && pendingView !== compareView
  const comparisonBaseDir = comparisonSnapshot
    ? `/history/${comparisonSnapshot.id}`
    : '/data'
  const modulesData = useSuspenseData<ModulesData>(
    `${comparisonBaseDir}/modules.data`,
    fetchModulesData
  )

  // Routes for comparison side B. This is the live build by default, or an
  // independently selected historical snapshot.
  const currentRoutes = useSuspenseData<string[]>(
    `${comparisonBaseDir}/routes.json`,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  // Whether the selected route exists on comparison side B. routes.json is
  // the source of truth because output directories can retain stale routes.
  const currentAnalyzeRouteExists =
    selectedRoute != null && currentRoutes.includes(selectedRoute)
  const analyzeDataPath = !currentAnalyzeRouteExists
    ? null
    : analyzeDataUrl(comparisonBaseDir, selectedRoute)

  const { data: analyzeData } = useSWR<AnalyzeData>(
    analyzeDataPath,
    fetchAnalyzeData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      suspense: true,
      onSuccess: (newData) => {
        const newRootSourceIndex = getRootSourceIndex(newData)
        setSelectedSourceIndex(newRootSourceIndex)
        setFocusedSourceIndex(newRootSourceIndex)
      },
    }
  )

  const { sidebarWidth, startResizing } = useSidebarResize()
  const [isMouseInTreemap, setIsMouseInTreemap] = useState(false)
  const [hoveredNodeInfo, setHoveredNodeInfo] = useState<{
    name: string
    size: number
    server?: boolean
    client?: boolean
    traced?: boolean
  } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  // Selected source in compare mode, identified by its full source path
  // (the diff row's `key`). Source indices differ between the two builds,
  // so we can't reuse `selectedSourceIndex`.
  const [compareSelectedKey, setCompareSelectedKey] = useState<string | null>(
    null
  )

  // Reset compare selection when the route or either side changes — the
  // previous selection is unlikely to exist in the new diff.
  useEffect(() => {
    setCompareSelectedKey(null)
  }, [selectedRoute, baselineSnapshot, comparisonSnapshot])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // esc clears current treemap source selection
      if (e.key === 'Escape') {
        const activeElement = document.activeElement
        const isInputFocused =
          activeElement && ['INPUT', 'TEXTAREA'].includes(activeElement.tagName)

        if (!isInputFocused) {
          e.preventDefault()
          const rootSourceIndex = analyzeData
            ? getRootSourceIndex(analyzeData)
            : 0
          setSelectedSourceIndex(rootSourceIndex)
          setFocusedSourceIndex(rootSourceIndex)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [analyzeData])

  // Compute module depth map from active entries
  const moduleDepthMap = useMemo(() => {
    if (!analyzeData) return new Map()

    const activeEntries = computeActiveEntries(modulesData, analyzeData)
    return computeModuleDepthMap(modulesData, activeEntries)
  }, [modulesData, analyzeData])

  const filterSource = useMemo(() => {
    if (!analyzeData) return () => true

    return (sourceIndex: number) => {
      const flags = analyzeData.getSourceFlags(sourceIndex)

      // Check environment filter
      const hasEnvironment =
        (environmentFilter === Environment.Client && flags.client) ||
        (environmentFilter === Environment.Server && flags.server)

      // Check type filter
      const hasType =
        (typeFilter.includes('js') && flags.js) ||
        (typeFilter.includes('css') && flags.css) ||
        (typeFilter.includes('json') && flags.json) ||
        (typeFilter.includes('asset') && flags.asset)

      return hasEnvironment && hasType
    }
  }, [analyzeData, environmentFilter, typeFilter])

  // In single-build (non-compare) mode the table view still wants a list
  // of every source for the current route. We synthesize this by diffing
  // the build against itself, which produces an all-`identical` summary
  // that we feed into `<DiffTable mode="single">`. This keeps a single
  // sources-listing implementation regardless of mode.
  const singleSourceListing = useMemo(() => {
    if (!analyzeData || baselineSnapshot) return null
    return diffSources(analyzeData, analyzeData, {
      filterSource: (_, index) => filterSource(index),
    })
  }, [analyzeData, baselineSnapshot, filterSource])

  // Per-route totals for both sides, used to size the route-level diff so
  // that routes whose modules changed can be reported as `changed` rather
  // than `identical`. Only fetched in compare mode.
  const { totals: currentRouteTotals } = useRouteTotals(
    baselineSnapshot ? currentRoutes : null,
    baselineSnapshot ? comparisonBaseDir : null
  )
  return {
    analyzeData,
    baselineSnapshot,
    compareSelectedKey,
    compareView: activeView,
    comparisonSnapshot,
    currentRoutes,
    environmentFilter,
    filterSource,
    focusedSourceIndex,
    hoveredNodeInfo,
    isHistoryLoading,
    isMouseInTreemap,
    isViewPending,
    moduleDepthMap,
    modulesData,
    currentRouteTotals,
    searchQuery,
    selectedRoute,
    selectedSourceIndex,
    setCompareSelectedKey,
    setCompareView: (view: CompareView) => {
      setPendingView(view)
      routeState.setView(view)
    },
    setEnvironmentFilter,
    setFocusedSourceIndex,
    setHoveredNodeInfo,
    setIsMouseInTreemap,
    setSearchQuery,
    setSelectedSourceIndex,
    setTypeFilter,
    sidebarWidth,
    singleSourceListing,
    startResizing,
    typeFilter,
    routeState,
  }
}

type AnalyzerModel = ReturnType<typeof useAnalyzerModel>

function AnalyzerFrame({
  topBar,
  children,
  footer,
}: {
  topBar: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="h-screen flex flex-col bg-background">
      {topBar}
      <div className="flex-1 flex min-h-0">{children}</div>
      {footer}
    </main>
  )
}

function AnalyzerTopBar({
  model,
  routeDiff = null,
}: {
  model: AnalyzerModel
  routeDiff?: CompareLayoutModel['routeDiff']
}) {
  return (
    <TopBar
      hasSourceData={model.analyzeData != null}
      showViewToggle={model.analyzeData != null}
      compareView={model.compareView}
      onCompareViewChange={model.setCompareView}
      selectedRoute={model.selectedRoute}
      setSelectedRoute={model.routeState.setRoute}
      environmentFilter={model.environmentFilter}
      setEnvironmentFilter={model.setEnvironmentFilter}
      setSelectedSourceIndex={model.setSelectedSourceIndex}
      setFocusedSourceIndex={model.setFocusedSourceIndex}
      typeFilter={model.typeFilter}
      setTypeFilter={model.setTypeFilter}
      searchQuery={model.searchQuery}
      setSearchQuery={model.setSearchQuery}
      baselineSnapshot={model.baselineSnapshot}
      onBaselineChange={(snapshot) => {
        if (snapshot) model.routeState.startComparison(snapshot)
        else model.routeState.stopComparison()
      }}
      comparisonSnapshot={model.comparisonSnapshot}
      onComparisonChange={model.routeState.setComparisonSnapshot}
      routeDiff={routeDiff}
    />
  )
}

function CompareAnalyzerView({ model }: { model: AnalyzerModel }) {
  if (model.isHistoryLoading) {
    return (
      <AnalyzerFrame topBar={<AnalyzerTopBar model={model} />}>
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading comparison…
        </div>
      </AnalyzerFrame>
    )
  }
  if (model.baselineSnapshot) return <ValidComparison model={model} />

  return (
    <AnalyzerFrame topBar={<AnalyzerTopBar model={model} />}>
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        The baseline snapshot in this URL is unavailable.
      </div>
    </AnalyzerFrame>
  )
}

function ValidComparison({ model }: { model: AnalyzerModel }) {
  const baselineSnapshot = model.baselineSnapshot
  if (!baselineSnapshot) return null

  return (
    <ValidComparisonContent model={model} baselineSnapshot={baselineSnapshot} />
  )
}

function ValidComparisonContent({
  model,
  baselineSnapshot,
}: {
  model: AnalyzerModel
  baselineSnapshot: SnapshotMetadata
}) {
  const baselineBaseDir = `/history/${baselineSnapshot.id}`
  const baselineModulesData = useSuspenseData<ModulesData>(
    `${baselineBaseDir}/modules.data`,
    fetchModulesData,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  )
  const baselineRoutes = useSuspenseData<string[]>(
    `${baselineBaseDir}/routes.json`,
    jsonFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  )
  const { totals: baselineRouteTotals } = useRouteTotals(
    baselineRoutes,
    baselineBaseDir
  )
  const routeDiff = useMemo(() => {
    if (!model.currentRouteTotals) return null
    return diffRoutesWithSizes(
      baselineRoutes,
      model.currentRoutes,
      baselineRouteTotals,
      model.currentRouteTotals
    )
  }, [
    baselineRoutes,
    model.currentRoutes,
    baselineRouteTotals,
    model.currentRouteTotals,
  ])
  const layoutProps = {
    baselineSnapshot,
    comparisonSnapshot: model.comparisonSnapshot,
    comparisonRouteCount: model.currentRoutes.length,
    routeDiff,
    baselineModulesData,
  }
  const selectedRoute = model.selectedRoute
  const content =
    selectedRoute && baselineRoutes.includes(selectedRoute) ? (
      <BaselineRouteComparison
        model={model}
        baselineBaseDir={baselineBaseDir}
        selectedRoute={selectedRoute}
        layoutProps={layoutProps}
      />
    ) : (
      <ComparisonContent
        model={model}
        baselineAnalyzeData={null}
        layoutProps={layoutProps}
      />
    )

  return (
    <AnalyzerFrame
      topBar={<AnalyzerTopBar model={model} routeDiff={routeDiff} />}
    >
      {content}
    </AnalyzerFrame>
  )
}

function BaselineRouteComparison({
  model,
  baselineBaseDir,
  selectedRoute,
  layoutProps,
}: {
  model: AnalyzerModel
  baselineBaseDir: string
  selectedRoute: string
  layoutProps: ComparisonLayoutProps
}) {
  const baselineAnalyzeData = useSuspenseData<AnalyzeData>(
    analyzeDataUrl(baselineBaseDir, selectedRoute),
    fetchAnalyzeData,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  )

  return (
    <ComparisonContent
      model={model}
      baselineAnalyzeData={baselineAnalyzeData}
      layoutProps={layoutProps}
    />
  )
}

type ComparisonLayoutProps = Pick<
  CompareLayoutModel,
  | 'baselineSnapshot'
  | 'comparisonSnapshot'
  | 'comparisonRouteCount'
  | 'routeDiff'
> & { baselineModulesData: ModulesData }

function ComparisonContent({
  model,
  baselineAnalyzeData,
  layoutProps,
}: {
  model: AnalyzerModel
  baselineAnalyzeData: AnalyzeData | null
  layoutProps: ComparisonLayoutProps
}) {
  const baselineModuleDepthMap = useMemo(() => {
    if (!baselineAnalyzeData) return new Map()
    const activeEntries = computeActiveEntries(
      layoutProps.baselineModulesData,
      baselineAnalyzeData
    )
    return computeModuleDepthMap(layoutProps.baselineModulesData, activeEntries)
  }, [layoutProps.baselineModulesData, baselineAnalyzeData])
  const compareFilterSource = useMemo(() => {
    return (side: 'A' | 'B', sourceIndex: number): boolean => {
      const data = side === 'A' ? baselineAnalyzeData : model.analyzeData
      if (!data) return false
      const flags = data.getSourceFlags(sourceIndex)
      const hasEnvironment =
        (model.environmentFilter === Environment.Client && flags.client) ||
        (model.environmentFilter === Environment.Server && flags.server)
      const hasType =
        (model.typeFilter.includes('js') && flags.js) ||
        (model.typeFilter.includes('css') && flags.css) ||
        (model.typeFilter.includes('json') && flags.json) ||
        (model.typeFilter.includes('asset') && flags.asset)
      return hasEnvironment && hasType
    }
  }, [
    baselineAnalyzeData,
    model.analyzeData,
    model.environmentFilter,
    model.typeFilter,
  ])
  const sourceDiff = useMemo(() => {
    if (!model.analyzeData && !baselineAnalyzeData) return null
    return diffSources(baselineAnalyzeData, model.analyzeData ?? null, {
      filterSource: compareFilterSource,
    })
  }, [model.analyzeData, baselineAnalyzeData, compareFilterSource])
  const compareModel: CompareLayoutModel = {
    ...layoutProps,
    selectedRoute: model.selectedRoute,
    sourceDiff,
    analyzeData: model.analyzeData ?? null,
    baselineAnalyzeData,
    modulesData: model.modulesData,
    moduleDepthMap: model.moduleDepthMap,
    baselineModuleDepthMap,
    environmentFilter: model.environmentFilter,
    sidebarWidth: model.sidebarWidth,
    compareView: model.compareView,
    searchQuery: model.searchQuery,
    isViewPending: model.isViewPending,
    selectedKey: model.compareSelectedKey,
    onSelectedKeyChange: model.setCompareSelectedKey,
  }

  return (
    <CompareLayout model={compareModel} onResizeSidebar={model.startResizing} />
  )
}

function SingleAnalyzerView({ model }: { model: AnalyzerModel }) {
  const analyzeData = model.analyzeData
  const content = analyzeData ? (
    <SingleAnalyzerContent model={model} analyzeData={analyzeData} />
  ) : null

  const footer =
    analyzeData && model.compareView === CompareView.Treemap ? (
      <TreemapFooter hoveredNodeInfo={model.hoveredNodeInfo} />
    ) : null

  return (
    <AnalyzerFrame topBar={<AnalyzerTopBar model={model} />} footer={footer}>
      {content}
    </AnalyzerFrame>
  )
}

function SingleAnalyzerContent({
  model,
  analyzeData,
}: {
  model: AnalyzerModel
  analyzeData: AnalyzeData
}) {
  const rootSourceIndex = getRootSourceIndex(analyzeData)

  return (
    <>
      <div className="flex-1 min-w-0">
        {model.isViewPending ? (
          <ViewSkeleton view={model.compareView} />
        ) : model.compareView === CompareView.Table &&
          model.singleSourceListing ? (
          <DiffTable
            summary={model.singleSourceListing}
            useCompressed
            nameHeading="Source"
            mode="single"
            searchQuery={model.searchQuery}
            onRowSelect={(row) => {
              if (row.sourceIndexB != null) {
                model.setSelectedSourceIndex(row.sourceIndexB)
                model.setFocusedSourceIndex(row.sourceIndexB)
              }
            }}
          />
        ) : (
          <TreemapVisualizer
            analyzeData={analyzeData}
            sourceIndex={rootSourceIndex}
            selectedSourceIndex={model.selectedSourceIndex ?? rootSourceIndex}
            onSelectSourceIndex={model.setSelectedSourceIndex}
            focusedSourceIndex={model.focusedSourceIndex ?? rootSourceIndex}
            onFocusSourceIndex={model.setFocusedSourceIndex}
            isMouseInTreemap={model.isMouseInTreemap}
            onMouseInTreemapChange={model.setIsMouseInTreemap}
            onHoveredNodeChange={model.setHoveredNodeInfo}
            searchQuery={model.searchQuery}
            filterSource={model.filterSource}
            sizeMode={SizeMode.Compressed}
          />
        )}
      </div>
      <button
        type="button"
        className="flex-none w-1 bg-border hover:bg-primary cursor-col-resize transition-colors"
        onMouseDown={model.startResizing}
        aria-label="Resize sidebar"
      />
      <Sidebar
        sidebarWidth={model.sidebarWidth}
        analyzeData={analyzeData}
        modulesData={model.modulesData}
        selectedSourceIndex={model.selectedSourceIndex}
        moduleDepthMap={model.moduleDepthMap}
        environmentFilter={model.environmentFilter}
        filterSource={model.filterSource}
      />
    </>
  )
}

function ViewSkeleton({ view }: { view: CompareView }) {
  return (
    <div className="h-full min-h-0 p-4" role="status" aria-label="Loading view">
      {view === CompareView.Treemap ? <TreemapSkeleton /> : <TableSkeleton />}
    </div>
  )
}

function TreemapFooter({
  hoveredNodeInfo,
}: {
  hoveredNodeInfo: AnalyzerModel['hoveredNodeInfo']
}) {
  return (
    <div className="flex-none border-t border-border bg-background px-4 py-2 h-10">
      <div className="text-sm text-muted-foreground">
        {hoveredNodeInfo ? (
          <>
            <span className="font-medium text-foreground">
              {hoveredNodeInfo.name}
            </span>
            <span className="ml-2 text-muted-foreground">
              {`${formatBytes(hoveredNodeInfo.size)} compressed`}
            </span>
            {(hoveredNodeInfo.server || hoveredNodeInfo.client) && (
              <span className="ml-2 inline-flex gap-1">
                {hoveredNodeInfo.client && (
                  <Badge variant="client">client</Badge>
                )}
                {hoveredNodeInfo.server && (
                  <Badge variant="server">server</Badge>
                )}
                {hoveredNodeInfo.traced && (
                  <Badge variant="traced">traced</Badge>
                )}
              </span>
            )}
          </>
        ) : (
          'Hover over a file to see details'
        )}
      </div>
    </div>
  )
}

function getRootSourceIndex(analyzeData: AnalyzeData): number {
  const sourceRoots = analyzeData.sourceRoots()
  return sourceRoots.length > 0 ? sourceRoots[0] : 0
}
