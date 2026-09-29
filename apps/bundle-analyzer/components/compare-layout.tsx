'use client'

import type { MouseEventHandler } from 'react'
import { CompareSidebar } from '@/components/sidebar'
import { DiffTable } from '@/components/diff-table'
import { DiffTreemap } from '@/components/diff-treemap'
import { StatCard, CountCard } from '@/components/stat-cards'
import { CompareView, Environment } from '@/components/top-bar'
import { TableSkeleton, TreemapSkeleton } from '@/components/ui/skeleton'
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
  model: CompareLayoutModel
  onResizeSidebar: MouseEventHandler<HTMLButtonElement>
}

export interface CompareLayoutModel {
  baselineSnapshot: SnapshotMetadata
  comparisonSnapshot: SnapshotMetadata | null
  comparisonRouteCount: number | null
  routeDiff: ReturnType<typeof diffRoutesWithSizes> | null
  selectedRoute: string | null
  sourceDiff: DiffSummary<SourceDiffRow> | null
  analyzeData: AnalyzeData | null
  baselineAnalyzeData: AnalyzeData | null
  modulesData: ModulesData
  baselineModulesData: ModulesData
  moduleDepthMap: Map<number, number>
  baselineModuleDepthMap: Map<number, number>
  environmentFilter: Environment
  sidebarWidth: number
  compareView: CompareView
  isViewPending: boolean
  searchQuery: string
  selectedKey: string | null
  onSelectedKeyChange: (key: string | null) => void
}

/**
 * Renders the comparison view (treemap + table) with a context strip at the
 * top showing the two builds being compared. The "before" build (A) is
 * rendered on the left and the selected "after" build (B) on the right, matching the user's mental model.
 *
 * Route selection lives in the top-bar route picker (`RouteTypeahead`),
 * which also renders per-route deltas in compare mode.
 */
export function CompareLayout({ model, onResizeSidebar }: CompareLayoutProps) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex flex-none flex-col border-b border-border xl:flex-row xl:items-stretch">
        <RouteStatsCard
          selectedRoute={model.selectedRoute}
          sourceDiff={model.sourceDiff}
          compressed
          className="xl:min-w-0 xl:flex-1 xl:basis-0 xl:border-r xl:border-border"
        />
        <CompareContextStrip
          baselineSnapshot={model.baselineSnapshot}
          comparisonRouteCount={model.comparisonRouteCount}
          routeDiff={model.routeDiff}
          compressed
          className="xl:min-w-0 xl:flex-1 xl:basis-0"
        />
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-1 min-w-0 flex-col">
          <ComparePerRoutePanel
            compareView={model.compareView}
            isViewPending={model.isViewPending}
            selectedRoute={model.selectedRoute}
            sourceDiff={model.sourceDiff}
            analyzeData={model.analyzeData}
            baselineAnalyzeData={model.baselineAnalyzeData}
            compressed
            searchQuery={model.searchQuery}
            baselineSnapshot={model.baselineSnapshot}
            comparisonSnapshot={model.comparisonSnapshot}
            compareSelectedKey={model.selectedKey}
            onCompareSelectedKeyChange={model.onSelectedKeyChange}
          />
        </div>
        <button
          type="button"
          className="flex-none w-1 bg-border hover:bg-primary cursor-col-resize transition-colors"
          onMouseDown={onResizeSidebar}
          aria-label="Resize sidebar"
        />
        <CompareSidebar
          selectedKey={model.selectedKey}
          sourceDiff={model.sourceDiff}
          analyzeData={model.analyzeData}
          baselineAnalyzeData={model.baselineAnalyzeData}
          modulesData={model.modulesData}
          baselineModulesData={model.baselineModulesData}
          moduleDepthMap={model.moduleDepthMap}
          baselineModuleDepthMap={model.baselineModuleDepthMap}
          environmentFilter={model.environmentFilter}
          sidebarWidth={model.sidebarWidth}
          aLabel={formatSnapshotLabel(model.baselineSnapshot)}
          bLabel={
            model.comparisonSnapshot
              ? formatSnapshotLabel(model.comparisonSnapshot)
              : 'Latest'
          }
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
export function CompareContextStrip({
  baselineSnapshot,
  comparisonRouteCount,
  routeDiff,
  compressed,
  className,
}: {
  baselineSnapshot: SnapshotMetadata
  comparisonRouteCount: number | null
  routeDiff: ReturnType<typeof diffRoutesWithSizes> | null
  compressed: boolean
  className?: string
}) {
  const baselineRoutes = baselineSnapshot.routeCount
  const comparisonRoutes =
    comparisonRouteCount ??
    routeDiff?.rows.filter((r) => r.status !== 'removed').length ??
    null

  const totalA = routeDiff
    ? compressed
      ? routeDiff.totalCompressedA
      : routeDiff.totalA
    : null
  const totalB = routeDiff
    ? compressed
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
          b={comparisonRoutes}
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
export function RouteStatsCard({
  selectedRoute,
  sourceDiff,
  compressed,
  className,
}: {
  selectedRoute: string | null
  sourceDiff: DiffSummary<SourceDiffRow> | null
  compressed: boolean
  className?: string
}) {
  const body = !selectedRoute ? (
    <div className="pt-1 text-xs text-muted-foreground">
      Select a route above to see per-source changes.
    </div>
  ) : !sourceDiff ? (
    <div className="pt-1 text-xs text-muted-foreground">
      No data for this route.
    </div>
  ) : (
    <RouteStatsBody sourceDiff={sourceDiff} compressed={compressed} />
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
  sourceDiff,
  compressed,
}: {
  sourceDiff: DiffSummary<SourceDiffRow>
  compressed: boolean
}) {
  const routeSizeA = compressed
    ? sourceDiff.totalCompressedA
    : sourceDiff.totalA
  const routeSizeB = compressed
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
 * in comparison build B, or was removed) with friendly messaging.
 */
export function ComparePerRoutePanel({
  compareView,
  isViewPending,
  selectedRoute,
  sourceDiff,
  analyzeData,
  baselineAnalyzeData,
  compressed,
  searchQuery,
  baselineSnapshot,
  comparisonSnapshot,
  compareSelectedKey,
  onCompareSelectedKeyChange,
}: {
  compareView: CompareView
  isViewPending: boolean
  selectedRoute: string | null
  sourceDiff: DiffSummary<SourceDiffRow> | null
  analyzeData: AnalyzeData | null
  baselineAnalyzeData: AnalyzeData | null
  compressed: boolean
  searchQuery: string
  baselineSnapshot: SnapshotMetadata
  comparisonSnapshot: SnapshotMetadata | null
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
  if (!sourceDiff) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
        No data for this route.
      </div>
    )
  }

  if (isViewPending) {
    return (
      <div
        className="flex flex-1 min-h-0 p-4"
        role="status"
        aria-label="Loading view"
      >
        {compareView === CompareView.Treemap ? (
          <TreemapSkeleton />
        ) : (
          <TableSkeleton />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {compareView === CompareView.Treemap ? (
        <DiffTreemap
          summary={sourceDiff}
          useCompressed={compressed}
          analyzeData={analyzeData}
          baselineAnalyzeData={baselineAnalyzeData}
          selectedKey={compareSelectedKey}
          onSelectKey={onCompareSelectedKeyChange}
        />
      ) : (
        <DiffTable
          summary={sourceDiff}
          useCompressed={compressed}
          nameHeading="Source"
          aHeading={formatSnapshotLabel(baselineSnapshot)}
          bHeading={
            comparisonSnapshot
              ? formatSnapshotLabel(comparisonSnapshot)
              : 'Latest'
          }
          searchQuery={searchQuery}
          selectedKey={compareSelectedKey}
          onRowSelect={(row) => onCompareSelectedKeyChange(row.key)}
        />
      )}
    </div>
  )
}
