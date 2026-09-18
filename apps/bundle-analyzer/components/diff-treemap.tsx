'use client'

import { useMemo, useState } from 'react'

import type { AnalyzeData } from '@/lib/analyze-data'
import type { DiffSummary, SourceDiffRow } from '@/lib/diff'
import { delta, formatDelta } from '@/lib/diff'
import { createDiffTreemapLayout } from '@/lib/diff-treemap-layout'
import { SizeMode, type LayoutNode } from '@/lib/treemap-layout'
import { TreemapVisualizer } from '@/components/treemap-visualizer'

/** Color-blind-safe blue/amber palette for bundle-size increases/decreases. */
const COLOR_INCREASE = '#2563eb' // blue-600
const COLOR_INCREASE_MUTED = 'rgba(37, 99, 235, 0.6)'
const COLOR_DECREASE = '#d97706' // amber-600
const COLOR_DECREASE_MUTED = 'rgba(217, 119, 6, 0.6)'

interface DiffTreemapProps {
  summary: DiffSummary<SourceDiffRow>
  useCompressed: boolean
  /**
   * Analyze data for comparison side B. Used as the source-of-truth tree
   * when present.
   */
  analyzeData: AnalyzeData | null
  /**
   * Analyze data for the baseline ("A") build. Only used when the route was
   * removed (no B-side data) so we can still render the removed sources.
   */
  baselineAnalyzeData: AnalyzeData | null
  searchQuery: string
  /**
   * Currently selected diff row (its `key`). Used so the compare sidebar
   * and treemap stay in sync when the user clicks elsewhere.
   */
  selectedKey?: string | null
  /**
   * Fires when the user clicks a tile. Receives the diff row's `key`,
   * or `null` if the click cleared selection.
   */
  onSelectKey?: (key: string | null) => void
}

/**
 * A treemap that visualizes a build-to-build diff using the same tile/layout
 * engine as the single-build view. Each leaf tile represents one source
 * file, and the color encodes the per-file delta:
 *
 * - bright blue: added in the comparison build
 * - bright amber: removed from the comparison build
 * - blue tint: same file, grew since the baseline build
 * - amber tint: same file, shrank since the baseline build
 * - neutral: same size in both builds
 *
 * Tile area represents the absolute size delta. The tree is synthesized from
 * the union of both builds, so additions and removals are both visible.
 */
export function DiffTreemap({
  summary,
  useCompressed,
  analyzeData,
  baselineAnalyzeData,
  searchQuery,
  selectedKey,
  onSelectKey,
}: DiffTreemapProps) {
  const data = analyzeData ?? baselineAnalyzeData
  const diffLayout = useMemo(
    () => createDiffTreemapLayout(summary.rows, useCompressed),
    [summary.rows, useCompressed]
  )
  const { rowBySourceIndex, sourceIndexByKey } = diffLayout

  const getFileColorOverride = useMemo(() => {
    return (node: LayoutNode): string | undefined => {
      if (node.sourceIndex === undefined) return undefined
      const row = rowBySourceIndex.get(node.sourceIndex)
      if (!row) return undefined
      return colorForRow(row, useCompressed)
    }
  }, [rowBySourceIndex, useCompressed])

  // Show size deltas on tiles instead of absolute sizes. Identical files fall
  // back to the default (absolute size) since ±0 on every unchanged tile
  // would be noise.
  const getFileSizeLabel = useMemo(() => {
    return (node: LayoutNode): string | undefined => {
      if (node.sourceIndex === undefined) return undefined
      const row = rowBySourceIndex.get(node.sourceIndex)
      if (!row || row.status === 'identical') return undefined
      return formatDelta(delta(row, useCompressed))
    }
  }, [rowBySourceIndex, useCompressed])

  // Focus state stays local: it controls drill-in/zoom, which is purely a
  // visual concern of the treemap and shouldn't affect the sidebar.
  const initialRoot = diffLayout.rootIndex
  const [focusedSourceIndex, setFocusedSourceIndex] =
    useState<number>(initialRoot)

  // Translate the externally-driven selection key into the side's source
  // index. Falls back to the root so the treemap renders something sensible
  // when the selection lives on the other side (e.g., a removed file).
  const selectedSourceIndex =
    (selectedKey != null ? sourceIndexByKey.get(selectedKey) : undefined) ??
    initialRoot

  const handleSelectSourceIndex = (idx: number) => {
    if (!onSelectKey) return
    const row = rowBySourceIndex.get(idx)
    onSelectKey(row?.key ?? null)
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data for this route.
      </div>
    )
  }

  return (
    <TreemapVisualizer
      analyzeData={data}
      sourceIndex={initialRoot}
      selectedSourceIndex={selectedSourceIndex}
      onSelectSourceIndex={handleSelectSourceIndex}
      focusedSourceIndex={focusedSourceIndex}
      onFocusSourceIndex={setFocusedSourceIndex}
      getFileSizeLabel={getFileSizeLabel}
      sizeMode={useCompressed ? SizeMode.Compressed : SizeMode.Uncompressed}
      getFileColorOverride={getFileColorOverride}
      computeLayout={diffLayout.computeLayout}
      getParentSourceIndex={diffLayout.getParentSourceIndex}
      getSourceName={diffLayout.getSourceName}
      searchQuery={searchQuery}
      overlay={<DiffLegend />}
    />
  )
}

/**
 * Picks a fill color for a diff row. Mirrors the previous DiffTreemap's
 * scheme: bright blue/amber for added/removed and lighter tints scaled by the
 * relative magnitude of the change for grew/shrank.
 */
function colorForRow(row: SourceDiffRow, useCompressed: boolean): string {
  if (row.status === 'added') return COLOR_INCREASE
  if (row.status === 'removed') return COLOR_DECREASE
  const deltaValue = useCompressed
    ? row.compressedB - row.compressedA
    : row.sizeB - row.sizeA
  // For changed rows, scale opacity by relative magnitude so a 1% change is
  // less alarming than a 50% change.
  const baseline = useCompressed ? row.compressedA : row.sizeA
  const ratio =
    baseline === 0 ? 1 : Math.min(1, Math.abs(deltaValue) / baseline)
  const alpha = 0.35 + ratio * 0.5
  return deltaValue > 0
    ? `rgba(37, 99, 235, ${alpha.toFixed(2)})`
    : `rgba(217, 119, 6, ${alpha.toFixed(2)})`
}

/** Static legend overlay so users can decode the color scheme at a glance. */
function DiffLegend() {
  const items: Array<{ label: string; color: string }> = [
    { label: 'Added', color: COLOR_INCREASE },
    { label: 'Grew', color: COLOR_INCREASE_MUTED },
    { label: 'Shrank', color: COLOR_DECREASE_MUTED },
    { label: 'Removed', color: COLOR_DECREASE },
  ]
  return (
    <div className="absolute bottom-2 left-2 flex items-center gap-3 rounded border border-border bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}
