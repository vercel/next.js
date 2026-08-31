'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { CompareLayout } from '@/components/compare-layout'
import { ErrorState } from '@/components/error-state'
import { Sidebar } from '@/components/sidebar'
import { TopBar, Environment, CompareView } from '@/components/top-bar'
import { TreemapVisualizer } from '@/components/treemap-visualizer'

import { Badge } from '@/components/ui/badge'
import { TreemapSkeleton } from '@/components/ui/skeleton'
import { AnalyzeData, ModulesData } from '@/lib/analyze-data'
import { diffRoutesWithSizes, diffSources } from '@/lib/diff'
import { useRouteTotals } from '@/lib/use-route-totals'
import { useSidebarResize } from '@/lib/use-sidebar-resize'
import { computeActiveEntries, computeModuleDepthMap } from '@/lib/module-graph'
import { type SnapshotMetadata } from '@/lib/snapshot'
import { fetchStrict, jsonFetcher } from '@/lib/utils'
import { formatBytes } from '@/lib/utils'
import { SizeMode } from '@/lib/treemap-layout'

/**
 * Resolve the URL of an `analyze.data` file for a given route. When `baseDir`
 * is non-empty, the file is fetched from a historical snapshot directory
 * instead of the live `data/` directory. Returns `null` when no route is
 * selected.
 */
function getAnalyzeDataPath(
  route: string | null,
  baseDir: 'data' | string
): string | null {
  if (!route) return null
  if (route === '/') return `${baseDir}/analyze.data`
  return `${baseDir}/${route.replace(/^\//, '')}/analyze.data`
}

export default function Home() {
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)
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

  // Selecting an A snapshot enables compare mode. B defaults to the live
  // build, but can be set to any other historical snapshot.
  const [baselineSnapshot, setBaselineSnapshot] =
    useState<SnapshotMetadata | null>(null)
  const [comparisonSnapshot, setComparisonSnapshot] =
    useState<SnapshotMetadata | null>(null)
  const isCompareMode = baselineSnapshot != null
  const comparisonBaseDir = comparisonSnapshot
    ? `history/${comparisonSnapshot.id}`
    : 'data'
  // Default view depends on mode: compare mode opens to the diff table
  // (the change list is the headline), single-build mode opens to the
  // treemap (size-by-area is the headline). Whenever the user toggles
  // between modes we reset to that mode's default; explicit user choices
  // within a mode are preserved until the mode changes again.
  const [compareView, setCompareView] = useState<CompareView>(
    CompareView.Treemap
  )
  const wasCompareModeRef = useRef(baselineSnapshot != null)
  useEffect(() => {
    const isNowCompare = baselineSnapshot != null
    if (wasCompareModeRef.current !== isNowCompare) {
      wasCompareModeRef.current = isNowCompare
      setCompareView(isNowCompare ? CompareView.Table : CompareView.Treemap)
    }
  }, [baselineSnapshot])

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
    ? `history/${baselineSnapshot.id}/modules.data`
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
    ? `history/${baselineSnapshot.id}/routes.json`
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
    : getAnalyzeDataPath(selectedRoute, comparisonBaseDir)

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
      ? getAnalyzeDataPath(selectedRoute, `history/${baselineSnapshot.id}`)
      : null
  const {
    data: baselineAnalyzeData,
    isLoading: isBaselineAnalyzeLoading,
    error: baselineAnalyzeError,
  } = useSWR<AnalyzeData>(baselineAnalyzePath, fetchAnalyzeData, {
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

  // Source-level diff for the currently selected route. Recomputed when
  // either side's data or the active filters change.
  //
  // Three cases:
  // 1. Route exists in both builds → diff(A, B).
  // 2. Route exists only in the baseline (removed) → there is no B-side
  //    `analyze.data`, but we still want to show the baseline's sources
  //    flagged as `removed`. We synthesize this by passing the baseline
  //    as both A and the empty-stand-in for B, then dropping the B side.
  //    `diffSources` accepts a non-null B, so we feed an empty walk by
  //    using the baseline data with a filter that always returns false
  //    for the B side.
  // 3. Route exists only in comparison build B (added) → analyzeData
  //    present, baselineAnalyzeData absent. Already handled below by
  //    passing `null` for A.
  const sourceDiff = useMemo(() => {
    if (!baselineSnapshot) return null
    if (analyzeData) {
      return diffSources(baselineAnalyzeData ?? null, analyzeData, {
        filterSource: compareFilterSource,
      })
    }
    // Removed-route case: only the baseline has data. Diff baseline vs.
    // baseline but suppress the B side via the filter so every source
    // appears as `removed`.
    if (baselineAnalyzeData) {
      return diffSources(baselineAnalyzeData, baselineAnalyzeData, {
        filterSource: (side, index) =>
          side === 'A' && compareFilterSource('A', index),
      })
    }
    return null
  }, [analyzeData, baselineAnalyzeData, baselineSnapshot, compareFilterSource])

  // Per-route totals for both sides, used to size the route-level diff so
  // that routes whose modules changed can be reported as `changed` rather
  // than `identical`. Only fetched in compare mode.
  const { totals: currentRouteTotals } = useRouteTotals(
    baselineSnapshot ? (currentRoutes ?? null) : null,
    baselineSnapshot ? comparisonBaseDir : null
  )
  const { totals: baselineRouteTotals } = useRouteTotals(
    baselineSnapshot ? (baselineRoutes ?? null) : null,
    baselineSnapshot ? `history/${baselineSnapshot.id}` : null
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
  const error = analyzeError || modulesError
  const isAnyLoading = isAnalyzeLoading || isModulesLoading
  const rootSourceIndex = getRootSourceIndex(analyzeData)

  let analyzerContent: ReactNode = null
  if (error && !analyzeData) {
    analyzerContent = <ErrorState error={error} />
  } else if (isCompareMode) {
    analyzerContent = (
      <CompareLayout
        baselineSnapshot={baselineSnapshot}
        comparisonSnapshot={comparisonSnapshot}
        compareView={compareView}
        searchQuery={searchQuery}
        selectedRoute={selectedRoute}
        comparisonRouteCount={currentRoutes?.length ?? null}
        routeDiff={routeDiff}
        sourceDiff={sourceDiff}
        analyzeData={analyzeData ?? null}
        baselineAnalyzeData={baselineAnalyzeData ?? null}
        isAnalyzeLoading={isAnalyzeLoading}
        isBaselineAnalyzeLoading={isBaselineAnalyzeLoading}
        baselineAnalyzeError={
          baselineAnalyzeError && baselineAnalyzeRouteExists
            ? baselineAnalyzeError
            : null
        }
        compressed
        compareSelectedKey={compareSelectedKey}
        setCompareSelectedKey={setCompareSelectedKey}
        modulesData={modulesData ?? null}
        baselineModulesData={baselineModulesData ?? null}
        moduleDepthMap={moduleDepthMap}
        baselineModuleDepthMap={baselineModuleDepthMap}
        environmentFilter={environmentFilter}
      />
    )
  } else if (isAnyLoading) {
    analyzerContent = (
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
          sidebarWidth={sidebarWidth}
          analyzeData={null}
          modulesData={null}
          selectedSourceIndex={null}
          moduleDepthMap={new Map()}
          environmentFilter={environmentFilter}
          isLoading={true}
        />
      </>
    )
  } else if (analyzeData) {
    analyzerContent = (
      <>
        <div className="flex-1 min-w-0">
          <TreemapVisualizer
            analyzeData={analyzeData}
            sourceIndex={rootSourceIndex}
            selectedSourceIndex={selectedSourceIndex ?? rootSourceIndex}
            onSelectSourceIndex={setSelectedSourceIndex}
            focusedSourceIndex={focusedSourceIndex ?? rootSourceIndex}
            onFocusSourceIndex={setFocusedSourceIndex}
            isMouseInTreemap={isMouseInTreemap}
            onMouseInTreemapChange={setIsMouseInTreemap}
            onHoveredNodeChange={setHoveredNodeInfo}
            searchQuery={searchQuery}
            filterSource={filterSource}
            sizeMode={SizeMode.Compressed}
          />
        </div>
        <button
          type="button"
          className="flex-none w-1 bg-border hover:bg-primary cursor-col-resize transition-colors"
          onMouseDown={startResizing}
          aria-label="Resize sidebar"
        />
        <Sidebar
          sidebarWidth={sidebarWidth}
          analyzeData={analyzeData}
          modulesData={modulesData ?? null}
          selectedSourceIndex={selectedSourceIndex}
          moduleDepthMap={moduleDepthMap}
          environmentFilter={environmentFilter}
          filterSource={filterSource}
        />
      </>
    )
  }

  return (
    <main className="h-screen flex flex-col bg-background">
      <TopBar
        hasSourceData={analyzeData != null}
        showViewToggle={isCompareMode}
        compareView={compareView}
        onCompareViewChange={setCompareView}
        selectedRoute={selectedRoute}
        setSelectedRoute={setSelectedRoute}
        environmentFilter={environmentFilter}
        setEnvironmentFilter={setEnvironmentFilter}
        setSelectedSourceIndex={setSelectedSourceIndex}
        setFocusedSourceIndex={setFocusedSourceIndex}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        baselineSnapshot={baselineSnapshot}
        onBaselineChange={(snapshot) => {
          setBaselineSnapshot(snapshot)
          if (!snapshot) setComparisonSnapshot(null)
        }}
        comparisonSnapshot={comparisonSnapshot}
        onComparisonChange={setComparisonSnapshot}
        routeDiff={routeDiff}
      />

      <div className="flex-1 flex min-h-0">{analyzerContent}</div>

      {analyzeData && !isCompareMode ? (
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
      ) : null}
    </main>
  )
}

function getRootSourceIndex(analyzeData: AnalyzeData | undefined): number {
  if (!analyzeData) return 0
  const sourceRoots = analyzeData.sourceRoots()
  return sourceRoots.length > 0 ? sourceRoots[0] : 0
}

async function fetchAnalyzeData(url: string): Promise<AnalyzeData> {
  const resp = await fetchStrict(url)
  return new AnalyzeData(await resp.arrayBuffer())
}

async function fetchModulesData(url: string): Promise<ModulesData> {
  const resp = await fetchStrict(url)
  return new ModulesData(await resp.arrayBuffer())
}
