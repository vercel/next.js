'use client'

import { useState, useEffect } from 'react'
import { CompareSidebar } from '@/components/sidebar'
import { DiffTable } from '@/components/diff-table'
import { DiffTreemap } from '@/components/diff-treemap'
import { TreemapSkeleton } from '@/components/ui/skeleton'
import { StatCard, CountCard } from '@/components/stat-cards'
import { CompareView, Environment } from '@/components/top-bar'
import { AnalyzeData, ModulesData } from '@/lib/analyze-data'
import {
  diffRoutesWithSizes,
  formatDelta,
  type DiffSummary,
  type SourceDiffRow,
} from '@/lib/diff'
import { formatSnapshotLabel, type SnapshotMetadata } from '@/lib/snapshot'
import { cn, formatBytes } from '@/lib/utils'

export interface CompareLayoutProps {
  baselineSnapshot: SnapshotMetadata
  compareView: CompareView
  selectedRoute: string | null
  currentRouteCount: number | null
  routeDiff: ReturnType<typeof diffRoutesWithSizes> | null
  sourceDiff: DiffSummary<SourceDiffRow> | null
  analyzeData: AnalyzeData | null
  baselineAnalyzeData: AnalyzeData | null
  isAnalyzeLoading: boolean
  isBaselineAnalyzeLoading: boolean
  baselineAnalyzeError: unknown | null
  useCompressed: boolean
  searchQuery: string
  compareSelectedKey: string | null
  setCompareSelectedKey: (key: string | null) => void
  modulesData: ModulesData | null
  baselineModulesData: ModulesData | null
  moduleDepthMap: Map<number, number>
  baselineModuleDepthMap: Map<number, number>
  environmentFilter: Environment
}

/**
 * Renders the comparison view (treemap + table) with a context strip at the
 * top showing the two builds being compared. The "before" build (A) is
 * rendered on the left and the "after" build (B) — the latest one — on the
 * right, matching the user's mental model.
 *
 * Route selection lives in the top-bar route picker (`RouteTypeahead`),
 * which also renders per-route deltas in compare mode.
 */
export function CompareLayout({
  baselineSnapshot,
  compareView,
  selectedRoute,
  currentRouteCount,
  routeDiff,
  sourceDiff,
  analyzeData,
  baselineAnalyzeData,
  isAnalyzeLoading,
  isBaselineAnalyzeLoading,
  baselineAnalyzeError,
  useCompressed,
  searchQuery,
  compareSelectedKey,
  setCompareSelectedKey,
  modulesData,
  baselineModulesData,
  moduleDepthMap,
  baselineModuleDepthMap,
  environmentFilter,
}: CompareLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(20)
  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    if (!isResizing) return
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth =
        ((window.innerWidth - e.clientX) / window.innerWidth) * 100
      setSidebarWidth(Math.max(10, Math.min(50, newWidth)))
    }
    const handleMouseUp = () => setIsResizing(false)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {/*
        Stats header. On wide viewports the Route stats sit next to the App
        stats so the user can compare route-level and app-level deltas
        without scrolling. Route is on the left because it's the primary
        scope the user's focused on; App is reference context.
        On narrow viewports the two strips stack vertically (route above
        app) and fall back to the original layout.
      */}
      <div className="flex flex-none flex-col border-b border-border xl:flex-row xl:items-stretch">
        <RouteStatsCard
          selectedRoute={selectedRoute}
          sourceDiff={sourceDiff}
          isAnalyzeLoading={isAnalyzeLoading}
          isBaselineAnalyzeLoading={isBaselineAnalyzeLoading}
          baselineAnalyzeError={baselineAnalyzeError}
          useCompressed={useCompressed}
          className="xl:min-w-0 xl:flex-1 xl:basis-0 xl:border-r xl:border-border"
        />
        <CompareContextStrip
          baselineSnapshot={baselineSnapshot}
          currentRouteCount={currentRouteCount}
          routeDiff={routeDiff}
          useCompressed={useCompressed}
          className="xl:min-w-0 xl:flex-1 xl:basis-0"
        />
      </div>

      {/*
        Per-route source diff + sidebar. The sidebar slides in when a row or
        treemap tile is selected and shows the import chain for that source.
      */}
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-1 min-w-0 flex-col">
          <ComparePerRoutePanel
            compareView={compareView}
            selectedRoute={selectedRoute}
            sourceDiff={sourceDiff}
            analyzeData={analyzeData}
            baselineAnalyzeData={baselineAnalyzeData}
            isAnalyzeLoading={isAnalyzeLoading}
            isBaselineAnalyzeLoading={isBaselineAnalyzeLoading}
            useCompressed={useCompressed}
            searchQuery={searchQuery}
            baselineSnapshot={baselineSnapshot}
            compareSelectedKey={compareSelectedKey}
            onCompareSelectedKeyChange={setCompareSelectedKey}
          />
        </div>
        <button
          type="button"
          className="flex-none w-1 bg-border hover:bg-primary cursor-col-resize transition-colors"
          onMouseDown={() => setIsResizing(true)}
          aria-label="Resize sidebar"
        />
        <CompareSidebar
          selectedKey={compareSelectedKey}
          sourceDiff={sourceDiff}
          analyzeData={analyzeData}
          baselineAnalyzeData={baselineAnalyzeData}
          modulesData={modulesData}
          baselineModulesData={baselineModulesData}
          moduleDepthMap={moduleDepthMap}
          baselineModuleDepthMap={baselineModuleDepthMap}
          environmentFilter={environmentFilter}
          sidebarWidth={sidebarWidth}
          aLabel={formatSnapshotLabel(baselineSnapshot)}
          bLabel="Latest"
        />
      </div>
    </div>
  )
}

/**
 * Strip across the top of the compare view that labels the two builds and
 * shows headline stats (total routes, added, removed, changed, identical,
 * total size). Modeled after the vite bundle-stats compare summary cards:
 * each card uses an `A → B` arrow with a delta chip, so size/count changes
 * are scannable at a glance.
 *
 * A/B label pills below identify which snapshot is which.
 */
function CompareContextStrip({
  baselineSnapshot,
  currentRouteCount,
  routeDiff,
  useCompressed,
  className,
}: {
  baselineSnapshot: SnapshotMetadata
  currentRouteCount: number | null
  routeDiff: ReturnType<typeof diffRoutesWithSizes> | null
  useCompressed: boolean
  className?: string
}) {
  const baselineRoutes = baselineSnapshot.routeCount
  const latestRoutes =
    currentRouteCount ??
    routeDiff?.rows.filter((r) => r.status !== 'removed').length ??
    null

  const totalA = routeDiff
    ? useCompressed
      ? routeDiff.totalCompressedA
      : routeDiff.totalA
    : null
  const totalB = routeDiff
    ? useCompressed
      ? routeDiff.totalCompressedB
      : routeDiff.totalB
    : null
  const sizeDelta = totalA != null && totalB != null ? totalB - totalA : null

  const counts = routeDiff?.counts

  return (
    <div
      className={cn(
        'flex flex-none flex-col gap-2 bg-muted/30 px-4 py-3',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          App
        </span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-wrap items-stretch gap-2">
        <StatCard
          label="Total routes"
          a={baselineRoutes}
          b={latestRoutes}
          deltaTone="neutral"
        />
        <StatCard
          label="Total size"
          a={totalA}
          b={totalB}
          formatValue={formatBytes}
          deltaValue={sizeDelta}
          formatDeltaValue={(d) => formatDelta(d)}
          deltaTone="size"
        />
        {counts ? (
          <>
            <CountCard label="Routes added" value={counts.added} tone="added" />
            <CountCard
              label="Routes removed"
              value={counts.removed}
              tone="removed"
            />
            <CountCard
              label="Routes changed"
              value={counts.changed}
              tone="changed"
            />
            <CountCard
              label="Routes identical"
              value={counts.identical}
              tone="identical"
            />
          </>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Route-scope stats card shown alongside the app-wide stats in the compare
 * view header. Handles the various "no data" states (no route picked yet,
 * loading, missing data) inline so the header always occupies a consistent
 * slot in the layout.
 */
function RouteStatsCard({
  selectedRoute,
  sourceDiff,
  isAnalyzeLoading,
  isBaselineAnalyzeLoading,
  baselineAnalyzeError,
  useCompressed,
  className,
}: {
  selectedRoute: string | null
  sourceDiff: DiffSummary<SourceDiffRow> | null
  isAnalyzeLoading: boolean
  isBaselineAnalyzeLoading: boolean
  baselineAnalyzeError: unknown | null
  useCompressed: boolean
  className?: string
}) {
  const isLoading = isAnalyzeLoading || isBaselineAnalyzeLoading

  const body = !selectedRoute ? (
    <div className="pt-1 text-xs text-muted-foreground">
      Select a route above to see per-source changes.
    </div>
  ) : isLoading ? (
    <div className="pt-1 text-xs text-muted-foreground">Loading…</div>
  ) : !sourceDiff ? (
    <div className="pt-1 text-xs text-muted-foreground">
      No data for this route.
    </div>
  ) : (
    <RouteStatsBody
      selectedRoute={selectedRoute}
      sourceDiff={sourceDiff}
      baselineAnalyzeError={baselineAnalyzeError}
      useCompressed={useCompressed}
    />
  )

  return (
    <div className={cn('flex flex-none flex-col gap-2 px-4 py-3', className)}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Route
        </span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      {body}
    </div>
  )
}

/**
 * Inner body for {@link RouteStatsCard} when source diff data is available.
 * Extracted so the stats card can render a placeholder cleanly when no data
 * is ready yet without nesting the data-dependent hooks/derivations above.
 */
function RouteStatsBody({
  selectedRoute: _selectedRoute,
  sourceDiff,
  baselineAnalyzeError: _baselineAnalyzeError,
  useCompressed,
}: {
  selectedRoute: string
  sourceDiff: DiffSummary<SourceDiffRow>
  baselineAnalyzeError: unknown | null
  useCompressed: boolean
}) {
  const routeSizeA = useCompressed
    ? sourceDiff.totalCompressedA
    : sourceDiff.totalA
  const routeSizeB = useCompressed
    ? sourceDiff.totalCompressedB
    : sourceDiff.totalB
  const routeSizeDelta = routeSizeB - routeSizeA
  const sourceCounts = sourceDiff.counts

  return (
    <>
      {/*
        Per-route stat strip. Mirrors the layout of the app-wide strip
        but at route scope, so the user reads two parallel summaries:
        one for the whole build, one drilled into the selected route.
        The source-level counters use a different label prefix
        ("Sources added" vs. the app-wide "Routes added") to make the
        unit unambiguous.
      */}
      <div className="flex flex-wrap items-stretch gap-2 pt-1">
        <StatCard
          label="Total size"
          a={routeSizeA}
          b={routeSizeB}
          formatValue={formatBytes}
          deltaValue={routeSizeDelta}
          formatDeltaValue={(d) => formatDelta(d)}
          deltaTone="size"
        />
        <CountCard
          label="Sources added"
          value={sourceCounts.added}
          tone="added"
        />
        <CountCard
          label="Sources removed"
          value={sourceCounts.removed}
          tone="removed"
        />
        <CountCard
          label="Sources changed"
          value={sourceCounts.changed}
          tone="changed"
        />
        <CountCard
          label="Sources identical"
          value={sourceCounts.identical}
          tone="identical"
        />
      </div>
    </>
  )
}

/**
 * Per-route comparison panel. Shows either the diff treemap or the diff table,
 * controlled by `compareView`. Handles missing-route states (the route is new
 * in the latest build, or was removed) with friendly messaging.
 */
function ComparePerRoutePanel({
  compareView,
  selectedRoute,
  sourceDiff,
  analyzeData,
  baselineAnalyzeData,
  isAnalyzeLoading,
  isBaselineAnalyzeLoading,
  useCompressed,
  searchQuery,
  baselineSnapshot,
  compareSelectedKey,
  onCompareSelectedKeyChange,
}: {
  compareView: CompareView
  selectedRoute: string | null
  sourceDiff: DiffSummary<SourceDiffRow> | null
  analyzeData: AnalyzeData | null
  baselineAnalyzeData: AnalyzeData | null
  isAnalyzeLoading: boolean
  isBaselineAnalyzeLoading: boolean
  useCompressed: boolean
  searchQuery: string
  baselineSnapshot: SnapshotMetadata
  compareSelectedKey: string | null
  onCompareSelectedKeyChange: (key: string | null) => void
}) {
  if (!selectedRoute) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
        Select a route above to see per-source changes.
      </div>
    )
  }
  if (isAnalyzeLoading || isBaselineAnalyzeLoading) {
    return (
      <div className="p-4">
        <TreemapSkeleton />
      </div>
    )
  }
  if (!sourceDiff) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
        No data for this route.
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {compareView === CompareView.Treemap ? (
        <DiffTreemap
          summary={sourceDiff}
          useCompressed={useCompressed}
          analyzeData={analyzeData}
          baselineAnalyzeData={baselineAnalyzeData}
          selectedKey={compareSelectedKey}
          onSelectKey={onCompareSelectedKeyChange}
        />
      ) : (
        <DiffTable
          summary={sourceDiff}
          useCompressed={useCompressed}
          nameHeading="Source"
          aHeading={formatSnapshotLabel(baselineSnapshot)}
          bHeading="Latest"
          searchQuery={searchQuery}
          selectedKey={compareSelectedKey}
          onRowSelect={(row) => onCompareSelectedKeyChange(row.key)}
        />
      )}
    </div>
  )
}
