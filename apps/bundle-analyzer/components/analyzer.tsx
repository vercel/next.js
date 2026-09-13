'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { TreemapSkeleton } from '@/components/ui/skeleton'
import { AnalyzeData, ModulesData } from '@/lib/analyze-data'
import {
  analyzeDataUrl,
  fetchAnalyzeData,
  fetchModulesData,
  useHistoryIndex,
} from '@/lib/analyzer-data'
import { diffRoutesWithSizes, diffSources } from '@/lib/diff'
import { useRouteTotals } from '@/lib/use-route-totals'
import { useSidebarResize } from '@/lib/use-sidebar-resize'
import { useAnalyzerRoute } from '@/lib/use-analyzer-route'
import { computeActiveEntries, computeModuleDepthMap } from '@/lib/module-graph'
import { jsonFetcher } from '@/lib/utils'
import { formatBytes } from '@/lib/utils'
import { SizeMode } from '@/lib/treemap-layout'

export function SingleAnalyzer() {
  const model = useAnalyzerModel(false)
  return <SingleAnalyzerView model={model} />
}

export function CompareAnalyzer() {
  const model = useAnalyzerModel(true)
  return <CompareAnalyzerView model={model} />
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
  const comparisonBaseDir = comparisonSnapshot
    ? `/history/${comparisonSnapshot.id}`
    : '/data'
  const {
    data: modulesData,
    isLoading: isModulesLoading,
    error: modulesError,
  } = useSWR<ModulesData>(`${comparisonBaseDir}/modules.data`, fetchModulesData)

  // Baseline modules.data, only fetched in compare mode. Used to power the
  // import-chain panel for the baseline ("A") side of the compare sidebar.
  // Snapshots are produced by copying the entire data dir (see
  // `packages/next/src/build/analyze/snapshot.ts`), so this file is
  // expected to exist for any historical snapshot.
  const baselineModulesPath = baselineSnapshot
    ? `/history/${baselineSnapshot.id}/modules.data`
    : null
  const { data: baselineModulesData } = useSWR<ModulesData>(
    baselineModulesPath,
    fetchModulesData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  )

  // Routes for comparison side B. This is the live build by default, or an
  // independently selected historical snapshot.
  const { data: currentRoutes } = useSWR<string[]>(
    `${comparisonBaseDir}/routes.json`,
    jsonFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  )

  // Routes for the historical baseline, used only in compare mode.
  const baselineRoutesPath = baselineSnapshot
    ? `/history/${baselineSnapshot.id}/routes.json`
    : null
  const { data: baselineRoutes } = useSWR<string[]>(
    baselineRoutesPath,
    jsonFetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  )

  // Whether the selected route exists on comparison side B. routes.json is
  // the source of truth because output directories can retain stale routes.
  const currentAnalyzeRouteExists =
    currentRoutes != null &&
    selectedRoute != null &&
    currentRoutes.includes(selectedRoute)
  const analyzeDataPath = !currentAnalyzeRouteExists
    ? null
    : analyzeDataUrl(comparisonBaseDir, selectedRoute)

  const {
    data: analyzeData,
    isLoading: isAnalyzeLoading,
    error: analyzeError,
  } = useSWR<AnalyzeData>(analyzeDataPath, fetchAnalyzeData, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    onSuccess: (newData) => {
      const newRootSourceIndex = getRootSourceIndex(newData)
      setSelectedSourceIndex(newRootSourceIndex)
      setFocusedSourceIndex(newRootSourceIndex)
    },
  })

  // Per-route analyze.data for the baseline build. Only fetched when both a
  // baseline and a route are selected and the route exists in the baseline.
  const baselineAnalyzeRouteExists =
    baselineRoutes != null &&
    selectedRoute != null &&
    baselineRoutes.includes(selectedRoute)
  const baselineAnalyzePath =
    baselineSnapshot && baselineAnalyzeRouteExists
      ? analyzeDataUrl(`/history/${baselineSnapshot.id}`, selectedRoute)
      : null
  const { data: baselineAnalyzeData, isLoading: isBaselineAnalyzeLoading } =
    useSWR<AnalyzeData>(baselineAnalyzePath, fetchAnalyzeData, {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      // Don't blow up if the baseline file is missing — the UI handles it
      // gracefully by labeling the route as "added".
      shouldRetryOnError: false,
    })

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
          const rootSourceIndex = getRootSourceIndex(analyzeData)
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
    if (!modulesData || !analyzeData) return new Map()

    const activeEntries = computeActiveEntries(modulesData, analyzeData)
    return computeModuleDepthMap(modulesData, activeEntries)
  }, [modulesData, analyzeData])

  // Same as `moduleDepthMap`, but for the baseline ("A") build. Only
  // computed in compare mode when both the baseline modules.data and
  // baseline analyze.data have loaded.
  const baselineModuleDepthMap = useMemo(() => {
    if (!baselineModulesData || !baselineAnalyzeData) return new Map()
    const activeEntries = computeActiveEntries(
      baselineModulesData,
      baselineAnalyzeData
    )
    return computeModuleDepthMap(baselineModulesData, activeEntries)
  }, [baselineModulesData, baselineAnalyzeData])

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

  // Build a per-side filter usable by the source diff. Each side gets its own
  // closure over its own `analyzeData`, since the source flags are
  // route/build-specific.
  const compareFilterSource = useMemo(() => {
    return (side: 'A' | 'B', sourceIndex: number): boolean => {
      const data = side === 'A' ? baselineAnalyzeData : analyzeData
      if (!data) return false
      const flags = data.getSourceFlags(sourceIndex)
      const hasEnvironment =
        (environmentFilter === Environment.Client && flags.client) ||
        (environmentFilter === Environment.Server && flags.server)
      const hasType =
        (typeFilter.includes('js') && flags.js) ||
        (typeFilter.includes('css') && flags.css) ||
        (typeFilter.includes('json') && flags.json) ||
        (typeFilter.includes('asset') && flags.asset)
      return hasEnvironment && hasType
    }
  }, [analyzeData, baselineAnalyzeData, environmentFilter, typeFilter])

  const sourceDiff = useMemo(() => {
    if (!baselineSnapshot) return null
    if (!analyzeData && !baselineAnalyzeData) return null
    return diffSources(baselineAnalyzeData ?? null, analyzeData ?? null, {
      filterSource: compareFilterSource,
    })
  }, [analyzeData, baselineAnalyzeData, baselineSnapshot, compareFilterSource])

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
    baselineSnapshot ? (currentRoutes ?? null) : null,
    baselineSnapshot ? comparisonBaseDir : null
  )
  const { totals: baselineRouteTotals } = useRouteTotals(
    baselineSnapshot ? (baselineRoutes ?? null) : null,
    baselineSnapshot ? `/history/${baselineSnapshot.id}` : null
  )

  // Route-level diff. Falls back to a name-only diff (`sizesA == null`)
  // while totals are still loading; once both sides' totals arrive, real
  // sizes drive `changed`/`identical` classification.
  const routeDiff = useMemo(() => {
    if (!baselineSnapshot || !currentRoutes) return null
    if (!currentRouteTotals) return null
    return diffRoutesWithSizes(
      baselineRoutes ?? null,
      currentRoutes,
      baselineRouteTotals,
      currentRouteTotals
    )
  }, [
    baselineSnapshot,
    baselineRoutes,
    currentRoutes,
    baselineRouteTotals,
    currentRouteTotals,
  ])

  // The compare panel can render even when the *baseline's* per-route data
  // failed to load (e.g., the route is new). Don't surface that as a top-level
  // error in compare mode.
  return {
    analyzeData,
    analyzeError,
    baselineAnalyzeData,
    baselineModuleDepthMap,
    baselineModulesData,
    baselineSnapshot,
    compareSelectedKey,
    compareView,
    comparisonSnapshot,
    currentRoutes,
    environmentFilter,
    filterSource,
    focusedSourceIndex,
    hoveredNodeInfo,
    isAnalyzeLoading,
    isBaselineAnalyzeLoading,
    isHistoryLoading,
    isModulesLoading,
    isMouseInTreemap,
    moduleDepthMap,
    modulesData,
    modulesError,
    routeDiff,
    searchQuery,
    selectedRoute,
    selectedSourceIndex,
    setCompareSelectedKey,
    setEnvironmentFilter,
    setFocusedSourceIndex,
    setHoveredNodeInfo,
    setIsMouseInTreemap,
    setSearchQuery,
    setSelectedSourceIndex,
    setTypeFilter,
    sidebarWidth,
    singleSourceListing,
    sourceDiff,
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

function AnalyzerTopBar({ model }: { model: AnalyzerModel }) {
  return (
    <TopBar
      hasSourceData={model.analyzeData != null}
      showViewToggle={model.analyzeData != null}
      compareView={model.compareView}
      onCompareViewChange={model.routeState.setView}
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
      routeDiff={model.routeDiff}
    />
  )
}

function CompareAnalyzerView({ model }: { model: AnalyzerModel }) {
  const error = model.analyzeError || model.modulesError
  let content: ReactNode = null
  if (error && !model.analyzeData) {
    content = <ErrorState error={error} />
  } else if (model.isHistoryLoading) {
    content = (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading comparison…
      </div>
    )
  } else if (model.baselineSnapshot) {
    const compareModel: CompareLayoutModel = {
      baselineSnapshot: model.baselineSnapshot,
      comparisonSnapshot: model.comparisonSnapshot,
      comparisonRouteCount: model.currentRoutes?.length ?? null,
      routeDiff: model.routeDiff,
      selectedRoute: model.selectedRoute,
      sourceDiff: model.sourceDiff,
      analyzeData: model.analyzeData ?? null,
      baselineAnalyzeData: model.baselineAnalyzeData ?? null,
      modulesData: model.modulesData ?? null,
      baselineModulesData: model.baselineModulesData ?? null,
      moduleDepthMap: model.moduleDepthMap,
      baselineModuleDepthMap: model.baselineModuleDepthMap,
      environmentFilter: model.environmentFilter,
      sidebarWidth: model.sidebarWidth,
      compareView: model.compareView,
      isAnalyzeLoading: model.isAnalyzeLoading,
      isBaselineAnalyzeLoading: model.isBaselineAnalyzeLoading,
      searchQuery: model.searchQuery,
      selectedKey: model.compareSelectedKey,
      onSelectedKeyChange: model.setCompareSelectedKey,
    }
    content = (
      <CompareLayout
        model={compareModel}
        onResizeSidebar={model.startResizing}
      />
    )
  } else {
    content = (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        The baseline snapshot in this URL is unavailable.
      </div>
    )
  }

  return (
    <AnalyzerFrame topBar={<AnalyzerTopBar model={model} />}>
      {content}
    </AnalyzerFrame>
  )
}

function SingleAnalyzerView({ model }: { model: AnalyzerModel }) {
  const error = model.analyzeError || model.modulesError
  const isLoading = model.isAnalyzeLoading || model.isModulesLoading
  let content: ReactNode = null
  if (error && !model.analyzeData) {
    content = <ErrorState error={error} />
  } else if (isLoading) {
    content = <SingleAnalyzerLoading model={model} />
  } else if (model.analyzeData) {
    content = <SingleAnalyzerContent model={model} />
  }

  const footer =
    model.analyzeData && model.compareView === CompareView.Treemap ? (
      <TreemapFooter hoveredNodeInfo={model.hoveredNodeInfo} />
    ) : null

  return (
    <AnalyzerFrame topBar={<AnalyzerTopBar model={model} />} footer={footer}>
      {content}
    </AnalyzerFrame>
  )
}

function SingleAnalyzerLoading({ model }: { model: AnalyzerModel }) {
  return (
    <>
      <div className="flex-1 min-w-0 p-4 bg-background">
        <TreemapSkeleton />
      </div>
      <button
        type="button"
        className="flex-none w-1 bg-border cursor-col-resize transition-colors"
        disabled
        aria-label="Resize sidebar"
      />
      <Sidebar
        sidebarWidth={model.sidebarWidth}
        analyzeData={null}
        modulesData={null}
        selectedSourceIndex={null}
        moduleDepthMap={new Map()}
        environmentFilter={model.environmentFilter}
        isLoading
      />
    </>
  )
}

function SingleAnalyzerContent({ model }: { model: AnalyzerModel }) {
  const analyzeData = model.analyzeData
  if (!analyzeData) return null
  const rootSourceIndex = getRootSourceIndex(analyzeData)

  return (
    <>
      <div className="flex-1 min-w-0">
        {model.compareView === CompareView.Table &&
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
        modulesData={model.modulesData ?? null}
        selectedSourceIndex={model.selectedSourceIndex}
        moduleDepthMap={model.moduleDepthMap}
        environmentFilter={model.environmentFilter}
        filterSource={model.filterSource}
      />
    </>
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

function getRootSourceIndex(analyzeData: AnalyzeData | undefined): number {
  if (!analyzeData) return 0
  const sourceRoots = analyzeData.sourceRoots()
  return sourceRoots.length > 0 ? sourceRoots[0] : 0
}
