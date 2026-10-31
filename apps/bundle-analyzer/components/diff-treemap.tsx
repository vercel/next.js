'use client'

import { useMemo, useState } from 'react'
import { rgba } from 'polished'

import type { AnalyzeData } from '@/lib/analyze-data'
import type { DiffSummary, SourceDiffRow } from '@/lib/diff'
import { delta, formatDelta } from '@/lib/diff'
import { createDiffTreemapLayout } from '@/lib/diff-treemap-layout'
import { SizeMode, type LayoutNode } from '@/lib/treemap-layout'
import {
  TreemapVisualizer,
  type CanvasColors,
} from '@/components/treemap-visualizer'

interface DiffTreemapProps {
  summary: DiffSummary<SourceDiffRow>
  useCompressed: boolean
  /** Comparison-side data; the synthetic diff tree drives tile layout. */
  analyzeData: AnalyzeData | null
  /** Baseline data used when the route was removed (no comparison data). */
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
 * Only changed files are shown; unchanged rows have no delta area.
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

  // The React Compiler currently rebuilds this synthetic tree on every render.
  // Keep it stable while hover and focus redraw the canvas.
  const diffLayout = useMemo(
    () => createDiffTreemapLayout(summary.rows, useCompressed),
    [summary.rows, useCompressed]
  )
  const { rowBySourceIndex, sourceIndexByKey } = diffLayout

  function getFileColorOverride(
    node: LayoutNode,
    colors: CanvasColors
  ): string | undefined {
    if (node.sourceIndex === undefined) return undefined
    const row = rowBySourceIndex.get(node.sourceIndex)
    return row ? colorForRow(row, useCompressed, colors) : undefined
  }

  // Show size deltas on changed tiles instead of absolute sizes.
  function getFileSizeLabel(node: LayoutNode): string | undefined {
    if (node.sourceIndex === undefined) return undefined
    const row = rowBySourceIndex.get(node.sourceIndex)
    if (!row || row.status === 'identical') return undefined
    return formatDelta(delta(row, useCompressed))
  }

  // Focus state stays local: it controls drill-in/zoom, which is purely a
  // visual concern of the treemap and shouldn't affect the sidebar.
  const initialRoot = diffLayout.rootIndex
  const [focusedSourceIndex, setFocusedSourceIndex] =
    useState<number>(initialRoot)

  // Translate selection into the synthetic tree's index. If the selected
  // path has no size delta, fall back to the root of changed files.
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
      source={diffLayout}
      selectedSourceIndex={selectedSourceIndex}
      onSelectSourceIndex={handleSelectSourceIndex}
      focusedSourceIndex={focusedSourceIndex}
      onFocusSourceIndex={setFocusedSourceIndex}
      getFileSizeLabel={getFileSizeLabel}
      sizeMode={useCompressed ? SizeMode.Compressed : SizeMode.Uncompressed}
      getFileColorOverride={getFileColorOverride}
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
function colorForRow(
  row: SourceDiffRow,
  useCompressed: boolean,
  colors: CanvasColors
): string {
  if (row.status === 'added') return colors.increase
  if (row.status === 'removed') return colors.decrease
  const deltaValue = useCompressed
    ? row.compressedB - row.compressedA
    : row.sizeB - row.sizeA
  // For changed rows, scale opacity by relative magnitude so a 1% change is
  // less alarming than a 50% change.
  const baseline = useCompressed ? row.compressedA : row.sizeA
  const ratio =
    baseline === 0 ? 1 : Math.min(1, Math.abs(deltaValue) / baseline)
  const alpha = 0.35 + ratio * 0.5
  return rgba(deltaValue > 0 ? colors.increase : colors.decrease, alpha)
}

/** Static legend overlay so users can decode the color scheme at a glance. */
function DiffLegend() {
  const items: Array<{ label: string; className: string }> = [
    { label: 'Added', className: 'bg-delta-increase' },
    { label: 'Grew', className: 'bg-delta-increase/60' },
    { label: 'Shrank', className: 'bg-delta-decrease/60' },
    { label: 'Removed', className: 'bg-delta-decrease' },
  ]
  return (
    <div className="absolute bottom-2 left-2 flex items-center gap-3 rounded border border-border bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={`inline-block h-3 w-3 rounded-sm ${item.className}`}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}
