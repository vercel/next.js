'use client'

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { OPEN_ROUTE_PICKER_EVENT } from '@/components/route-typeahead'
import {
  CompareLayout,
  type CompareLayoutModel,
} from '@/components/compare-layout'
import { DiffTable } from '@/components/diff-table'
import { Sidebar } from '@/components/sidebar'
import { TopBar, Environment, CompareView } from '@/components/top-bar'
import { TreemapVisualizer } from '@/components/treemap-visualizer'

import { Badge } from '@/components/ui/badge'
import {
  AnalyzerChromeSkeleton,
  RouteSummarySkeleton,
  TableSkeleton,
  TreemapSkeleton,
} from '@/components/ui/skeleton'
import { AnalyzeData, ModulesData } from '@/lib/analyze-data'
import {
  analyzeDataUrl,
  fetchAnalyzeData,
  fetchModulesData,
  useHistoryIndex,
  useSuspenseData,
} from '@/lib/analyzer-data'
import { diffRoutesWithSizes, diffSources, type RouteSummary } from '@/lib/diff'
import { useSidebarResize } from '@/lib/use-sidebar-resize'
import { useAnalyzerRoute } from '@/lib/use-analyzer-route'
import { computeActiveEntries, computeModuleDepthMap } from '@/lib/module-graph'
import type { SnapshotMetadata } from '@/lib/snapshot'
import { jsonFetcher } from '@/lib/utils'
import { formatBytes } from '@/lib/utils'
import { SizeMode } from '@/lib/treemap-layout'
import { ArrowRight, Monitor } from 'lucide-react'

export function SingleAnalyzer() {
  return (
    <AnalyzerBoundary defaultView={CompareView.Treemap}>
      <SingleAnalyzerController />
    </AnalyzerBoundary>
  )
}

export function RouteSummaryPage() {
  return (
    <AnalyzerBoundary
      defaultView={CompareView.Treemap}
      fallback={<RouteSummarySkeleton />}
    >
      <RouteSummaryController />
    </AnalyzerBoundary>
  )
}

function RouteSummaryController() {
  const model = useAnalyzerModel(false)
  return (
    <AnalyzerFrame
      topBar={<AnalyzerTopBar model={model} showComparison={false} />}
    >
      <RouteOverview model={model} />
    </AnalyzerFrame>
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
  fallback,
}: {
  children: ReactNode
  defaultView: CompareView
  fallback?: ReactNode
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return fallback ?? <AnalyzerFallback view={defaultView} />

  return (
    <Suspense fallback={fallback ?? <AnalyzerFallback view={defaultView} />}>
      {children}
    </Suspense>
  )
}

function AnalyzerFallback({ view }: { view: CompareView }) {
  return <AnalyzerChromeSkeleton view={view} />
}

function useAnalyzerModel(compare: boolean) {
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | null>(
    null
  )
  const [focusedSourceIndex, setFocusedSourceIndex] = useState<number | null>(
    null
  )

  const { data: history, isLoading: isHistoryLoading } = useHistoryIndex()
  const routeState = useAnalyzerRoute(compare, history?.snapshots)
  const {
    baselineSnapshot,
    comparisonSnapshot,
    compareView,
    environmentFilter,
    searchQuery,
    selectedRoute,
    typeFilter,
  } = routeState
  const [searchInput, setSearchInput] = useState(searchQuery)
  const setSearchQueryRef = useRef(routeState.setSearchQuery)
  setSearchQueryRef.current = routeState.setSearchQuery

  useEffect(() => {
    setSearchInput(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    if (searchInput === searchQuery) return
    const timeout = setTimeout(() => {
      setSearchQueryRef.current(searchInput)
    }, 250)
    return () => clearTimeout(timeout)
  }, [searchInput, searchQuery])

  const [pendingView, setPendingView] = useState<CompareView | null>(null)

  useEffect(() => {
    if (pendingView === compareView) setPendingView(null)
  }, [compareView, pendingView])

  useEffect(() => {
    setSearchInput(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    if (searchInput === searchQuery) return
    const timeout = setTimeout(() => {
      setSearchQueryRef.current(searchInput)
    }, 250)
    return () => clearTimeout(timeout)
  }, [searchInput, searchQuery])

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

  const routeSummaries = useSuspenseData<RouteSummary[]>(
    `${comparisonBaseDir}/route-summaries.json`,
    jsonFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  )
  const clientRouteTotals = useMemo(
    () =>
      new Map(
        routeSummaries.map(({ route, client }) => [
          route,
          {
            size: client.size,
            compressedSize: client.compressed_size,
          },
        ])
      ),
    [routeSummaries]
  )
  const currentRouteTotals = useMemo(
    () =>
      new Map(
        routeSummaries.map(({ route, size, compressed_size }) => [
          route,
          { size, compressedSize: compressed_size },
        ])
      ),
    [routeSummaries]
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
    clientRouteTotals,
    searchQuery: searchInput,
    selectedRoute,
    selectedSourceIndex,
    setCompareSelectedKey,
    setCompareView: (view: CompareView) => {
      setPendingView(view)
      routeState.setView(view)
    },
    setEnvironmentFilter: routeState.setEnvironmentFilter,
    setFocusedSourceIndex,
    setHoveredNodeInfo,
    setIsMouseInTreemap,
    setSearchQuery: setSearchInput,
    setSelectedSourceIndex,
    setTypeFilter: routeState.setTypeFilter,
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
  showComparison = true,
}: {
  model: AnalyzerModel
  routeDiff?: CompareLayoutModel['routeDiff']
  showComparison?: boolean
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
        if (snapshot) {
          model.routeState.startComparison(snapshot)
        } else model.routeState.stopComparison()
      }}
      comparisonSnapshot={model.comparisonSnapshot}
      onComparisonChange={model.routeState.setComparisonSnapshot}
      routeDiff={routeDiff}
      routeTotals={model.clientRouteTotals}
      showComparison={showComparison}
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
  const { data: baselineRouteSummaries } = useSWR<RouteSummary[]>(
    `${baselineBaseDir}/route-summaries.json`,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  )
  const baselineRouteTotals = useMemo(
    () =>
      baselineRouteSummaries
        ? new Map(
            baselineRouteSummaries.map(({ route, size, compressed_size }) => [
              route,
              { size, compressedSize: compressed_size },
            ])
          )
        : null,
    [baselineRouteSummaries]
  )
  const routeDiff = useMemo(() => {
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
  const alternateEnvironment = getAlternateEnvironment(model.environmentFilter)
  const hasAlternateEnvironmentSources = useMemo(
    () =>
      [model.analyzeData, baselineAnalyzeData].some(
        (data) =>
          data &&
          hasEnvironmentSources(data, alternateEnvironment, model.typeFilter)
      ),
    [
      model.analyzeData,
      baselineAnalyzeData,
      alternateEnvironment,
      model.typeFilter,
    ]
  )
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
    hasAlternateEnvironmentSources,
    setEnvironmentFilter: model.setEnvironmentFilter,
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
  ) : (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      Select a route to analyze.
    </div>
  )

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

function RouteOverview({ model }: { model: AnalyzerModel }) {
  const [visibleRouteCount, setVisibleRouteCount] = useState(15)
  const [routePickerShortcut, setRoutePickerShortcut] = useState('⌘K')

  useEffect(() => {
    if (!/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)) {
      setRoutePickerShortcut('Ctrl+K')
    }
  }, [])

  const rankedRoutes = useMemo(
    () =>
      model.currentRoutes
        .map((route) => ({
          route,
          compressedSize:
            model.clientRouteTotals?.get(route)?.compressedSize ?? 0,
        }))
        .sort((left, right) => right.compressedSize - left.compressedSize),
    [model.clientRouteTotals, model.currentRoutes]
  )
  const visibleRoutes = rankedRoutes.slice(0, visibleRouteCount)
  const remainingRouteCount = rankedRoutes.length - visibleRoutes.length

  return (
    <div className="flex flex-1 justify-center overflow-auto px-6 py-12">
      <section
        className="w-full max-w-3xl"
        aria-labelledby="route-overview-title"
      >
        <div className="mb-6 flex items-start justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Monitor className="h-4 w-4" />
              Client bundles
            </div>
            <h1 id="route-overview-title" className="text-2xl font-semibold">
              Largest client payloads
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Start with the routes that send the most compressed code to the
              browser.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm tabular-nums text-muted-foreground">
              {model.currentRoutes.length} routes
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                window.dispatchEvent(new Event(OPEN_ROUTE_PICKER_EVENT))
              }
            >
              Find any route
              <Kbd>{routePickerShortcut}</Kbd>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border bg-card">
          {visibleRoutes.map(({ route, compressedSize }, index) => (
            <Link
              key={route}
              href={{ pathname: '/analyze', query: { route } }}
              className="group flex w-full items-center gap-4 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent"
            >
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-sm">
                {route}
              </span>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {formatBytes(compressedSize)}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          ))}
          {remainingRouteCount > 0 ? (
            <button
              type="button"
              className="flex w-full items-center justify-center px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setVisibleRouteCount((count) => count + 10)}
            >
              Show {Math.min(10, remainingRouteCount)} more
            </button>
          ) : null}
        </div>
      </section>
    </div>
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
  const hasAlternateEnvironmentSources = hasEnvironmentSources(
    analyzeData,
    getAlternateEnvironment(model.environmentFilter),
    model.typeFilter
  )
  const alternateEnvironmentEmptyState = hasAlternateEnvironmentSources ? (
    <AlternateEnvironmentEmptyState environment={model.environmentFilter} />
  ) : undefined

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
            emptyState={alternateEnvironmentEmptyState}
            onRowSelect={(row) => {
              if (row.sourceIndexB != null) {
                model.setSelectedSourceIndex(row.sourceIndexB)
                model.setFocusedSourceIndex(row.sourceIndexB)
              }
            }}
          />
        ) : model.singleSourceListing?.rows.length === 0 &&
          alternateEnvironmentEmptyState ? (
          <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
            {alternateEnvironmentEmptyState}
          </div>
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

function hasEnvironmentSources(
  data: AnalyzeData,
  environment: Environment,
  typeFilter: string[]
): boolean {
  for (let index = 0; index < data.sourceCount(); index++) {
    const flags = data.getSourceFlags(index)
    const hasEnvironment =
      (environment === Environment.Client && flags.client) ||
      (environment === Environment.Server && flags.server)
    const hasType =
      (typeFilter.includes('js') && flags.js) ||
      (typeFilter.includes('css') && flags.css) ||
      (typeFilter.includes('json') && flags.json) ||
      (typeFilter.includes('asset') && flags.asset)
    if (hasEnvironment && hasType) {
      return true
    }
  }
  return false
}

function getAlternateEnvironment(environment: Environment): Environment {
  return environment === Environment.Client
    ? Environment.Server
    : Environment.Client
}

export function AlternateEnvironmentEmptyState({
  environment,
}: {
  environment: Environment
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentLabel = environment === Environment.Client ? 'client' : 'server'
  const alternateLabel =
    environment === Environment.Client ? 'server' : 'client'
  const nextSearchParams = new URLSearchParams(searchParams.toString())
  nextSearchParams.set('environment', alternateLabel)
  const href = `${pathname}?${nextSearchParams.toString()}`

  return (
    <span>
      This route has no {currentLabel} sources matching the active file types.{' '}
      <Link
        href={href}
        replace
        className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
      >
        Show {alternateLabel} sources
      </Link>
      .
    </span>
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
