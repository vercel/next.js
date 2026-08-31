'use client'

import { useMemo, useState } from 'react'

import type { AnalyzeData } from '@/lib/analyze-data'
import type { DiffSummary, SourceDiffRow } from '@/lib/diff'
import { delta, formatDelta } from '@/lib/diff'
import { SizeMode, type LayoutNode } from '@/lib/treemap-layout'
import { TreemapVisualizer } from '@/components/treemap-visualizer'

/**
 * Threshold (bytes) below which a row's delta is considered "noise" and the
 * row is rendered as neutral grey rather than red/green. This keeps the
 * visualization legible when the build pipeline produces tiny non-deterministic
 * size deltas (e.g., source-map paths, comments).
 */
const NEUTRAL_DELTA_THRESHOLD = 4

/** Color palette for diff tiles. Red = more bytes (bad), green = fewer bytes (good). */
const COLOR_ADDED = '#dc2626' // red-600 — new bytes in bundle
const COLOR_REMOVED = '#16a34a' // green-600 — bytes removed from bundle
const COLOR_NEUTRAL = '#9ca3af' // gray-400

interface DiffTreemapProps {
  summary: DiffSummary<SourceDiffRow>
  useCompressed: boolean
  /**
   * Analyze data for the current ("B") build. Used as the source-of-truth
   * tree when present.
   */
  analyzeData: AnalyzeData | null
  /**
   * Analyze data for the baseline ("A") build. Only used when the route was
   * removed (no B-side data) so we can still render the removed sources.
   */
  baselineAnalyzeData: AnalyzeData | null
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
 * - bright red: added in the latest build (more bytes = bad)
 * - bright green: removed in the historical build (fewer bytes = good)
 * - red tint: same file, grew since the historical build
 * - green tint: same file, shrank since the historical build
 * - neutral: same size in both builds
 *
 * Removed files don't exist in the current build's source tree so they
 * don't appear in the treemap; users can still see them in the table view.
 */
export function DiffTreemap({
  summary,
  useCompressed,
  analyzeData,
  baselineAnalyzeData,
  selectedKey,
  onSelectKey,
}: DiffTreemapProps) {
  // Pick the side that drives the source tree. Prefer the current build (B);
  // fall back to baseline (A) for the "removed route" case where there's no
  // B-side data.
  const data = analyzeData ?? baselineAnalyzeData

  // Map from this side's source index to its diff row. Used by the color
  // override to look up the per-tile status.
  const rowBySourceIndex = useMemo(() => {
    const map = new Map<number, SourceDiffRow>()
    const side: 'A' | 'B' = analyzeData ? 'B' : 'A'
    for (const row of summary.rows) {
      const idx = side === 'B' ? row.sourceIndexB : row.sourceIndexA
      if (idx != null) map.set(idx, row)
    }
    return map
  }, [summary, analyzeData])

  // The AnalyzeData tree can contain the same source path at multiple indices
  // (e.g. one file included in several chunks). In the diff treemap we only
  // want each unique path to appear once, using the canonical source index
  // stored on the diff row. Passing this as `filterSource` removes all
  // duplicate instances from the layout so there are no confusing gray tiles
  // and clicking always resolves to a diff row.
  const canonicalSourceIndices = useMemo(
    () => new Set(rowBySourceIndex.keys()),
    [rowBySourceIndex]
  )

  // Reverse lookup so we can map a selected diff key (full source path) back
  // to a source index in the active side's tree.
  const sourceIndexByKey = useMemo(() => {
    const map = new Map<string, number>()
    for (const [idx, row] of rowBySourceIndex.entries()) {
      map.set(row.key, idx)
    }
    return map
  }, [rowBySourceIndex])

  const getFileColorOverride = useMemo(() => {
    return (node: LayoutNode): string | undefined => {
      if (node.sourceIndex === undefined) return undefined
      const row = rowBySourceIndex.get(node.sourceIndex)
      if (!row) return COLOR_NEUTRAL
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
  const initialRoot = useMemo(() => {
    if (!data) return 0
    const roots = data.sourceRoots()
    return roots.length > 0 ? roots[0] : 0
  }, [data])
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
      filterSource={(idx) => canonicalSourceIndices.has(idx)}
      getFileSizeLabel={getFileSizeLabel}
      sizeMode={useCompressed ? SizeMode.Compressed : SizeMode.Uncompressed}
      getFileColorOverride={getFileColorOverride}
      overlay={<DiffLegend hasRemoved={summary.counts.removed > 0} />}
    />
  )
}

/**
 * Picks a fill color for a diff row. Mirrors the previous DiffTreemap's
 * scheme: bright green/red for added/removed, lighter tints scaled by the
 * relative magnitude of the change for grew/shrank, and neutral grey for
 * sub-threshold changes.
 */
function colorForRow(row: SourceDiffRow, useCompressed: boolean): string {
  if (row.status === 'added') return COLOR_ADDED
  if (row.status === 'removed') return COLOR_REMOVED
  const deltaValue = useCompressed
    ? row.compressedB - row.compressedA
    : row.sizeB - row.sizeA
  if (Math.abs(deltaValue) <= NEUTRAL_DELTA_THRESHOLD) {
    return COLOR_NEUTRAL
  }
  // For changed rows, scale opacity by relative magnitude so a 1% change is
  // less alarming than a 50% change.
  const baseline = useCompressed ? row.compressedA : row.sizeA
  const ratio =
    baseline === 0 ? 1 : Math.min(1, Math.abs(deltaValue) / baseline)
  const alpha = 0.35 + ratio * 0.5
  return deltaValue > 0
    ? `rgba(220, 38, 38, ${alpha.toFixed(2)})`
    : `rgba(22, 163, 74, ${alpha.toFixed(2)})`
}

/** Static legend overlay so users can decode the color scheme at a glance. */
function DiffLegend({ hasRemoved }: { hasRemoved: boolean }) {
  const items: Array<{ label: string; color: string }> = [
    { label: 'Added', color: COLOR_ADDED },
    { label: 'Grew', color: 'rgba(220, 38, 38, 0.6)' },
    { label: 'Unchanged', color: COLOR_NEUTRAL },
    { label: 'Shrank', color: 'rgba(22, 163, 74, 0.6)' },
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
      {hasRemoved ? (
        <span className="border-l border-border pl-3 italic">
          Removed sources are listed in the table view.
        </span>
      ) : null}
    </div>
  )
}
