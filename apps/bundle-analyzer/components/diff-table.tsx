'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Minus,
  MinusCircle,
  Package,
  PlusCircle,
} from 'lucide-react'

import {
  delta,
  formatDelta,
  sortByImpact,
  type DiffRow,
  type DiffSummary,
  type DiffStatus,
} from '@/lib/diff'
import { formatBytes } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

/** Which column the table is currently sorted by. */
type SortColumn = 'name' | 'a' | 'b' | 'delta'
/** Sort direction. */
type SortDirection = 'asc' | 'desc'

interface DiffTableProps<Row extends DiffRow> {
  summary: DiffSummary<Row>
  useCompressed: boolean
  /** Optional callback fired when a row is clicked. */
  onRowSelect?: (row: Row) => void
  /**
   * Optional `key` of the currently-selected row. Highlights that row in
   * the table so it stays visually linked to the compare sidebar.
   */
  selectedKey?: string | null
  /** Optional column heading override for the "name" column. */
  nameHeading?: string
  /**
   * Optional column heading override for the historical (before) column. The
   * tooltip on hover always identifies the column as the historical build.
   * Defaults to `'A'`.
   */
  aHeading?: string
  /**
   * Optional column heading override for the latest (after) column.
   * Defaults to `'B'`.
   */
  bHeading?: string
  /** Caption shown above the table. */
  caption?: string
  /**
   * Display mode.
   *
   * - `'compare'` (default): full A | B | Δ columns, status filter,
   *   per-row status icons. Used when comparing two builds.
   * - `'single'`: a single `Size` column (mapped to B). Hides the
   *   status filter and status iconography because every row is
   *   `identical` against itself.
   */
  mode?: 'compare' | 'single'
  /**
   * Optional case-insensitive substring filter applied to each row's
   * full path (`key`) and display name (`name`). When non-empty, only
   * matching rows are rendered. Mirrors the treemap's search filter so
   * the toolbar input affects both views consistently.
   */
  searchQuery?: string
}

/**
 * Compact table comparing two builds, modeled on the vite-compare module-diff
 * view. Columns:
 *
 *   | Name | A (before) | B (after) | Δ |
 *
 * Rows are sorted by absolute delta (largest impact first).
 */
export function DiffTable<Row extends DiffRow>({
  summary,
  useCompressed,
  onRowSelect,
  selectedKey,
  nameHeading = 'Name',
  aHeading = 'A',
  bHeading = 'B',
  caption,
  mode = 'compare',
  searchQuery,
}: DiffTableProps<Row>) {
  const isSingle = mode === 'single'
  const [statusFilter, setStatusFilter] = useState<DiffStatus | 'all'>('all')
  // Default sort:
  //   - compare mode: rank by largest absolute delta (most-impactful change first).
  //   - single mode: rank by size descending (largest contributors first).
  const [sortColumn, setSortColumn] = useState<SortColumn>(
    isSingle ? 'b' : 'delta'
  )
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  // Source rows that live in the same npm package are grouped under a single
  // collapsible header row. Tracks which package headers are expanded.
  const [expandedPackages, setExpandedPackages] = useState<ReadonlySet<string>>(
    () => new Set()
  )

  const togglePackage = (packageName: string) => {
    setExpandedPackages((prev) => {
      const next = new Set(prev)
      if (next.has(packageName)) next.delete(packageName)
      else next.add(packageName)
      return next
    })
  }

  const sorted = useMemo(() => {
    // The default `delta`/`desc` mode preserves the existing impact-ranked
    // sort, which keeps `identical` rows pinned at the bottom regardless of
    // direction. Other columns sort lexicographically (name) or numerically
    // (A, B) using the user's chosen direction.
    if (sortColumn === 'delta' && sortDirection === 'desc') {
      return sortByImpact(summary.rows, useCompressed)
    }
    return sortRows(summary.rows, sortColumn, sortDirection, useCompressed)
  }, [summary.rows, sortColumn, sortDirection, useCompressed])

  const onHeaderClick = (column: SortColumn) => {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      // Sensible default direction for each column type: text columns start
      // ascending (A→Z), numeric columns start descending (largest first).
      setSortDirection(column === 'name' ? 'asc' : 'desc')
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery?.trim().toLowerCase() ?? ''
    return sorted.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (q !== '') {
        const key = row.key.toLowerCase()
        const name = row.name.toLowerCase()
        if (!key.includes(q) && !name.includes(q)) return false
      }
      return true
    })
  }, [sorted, statusFilter, searchQuery])

  // Group filtered rows by package, preserving the user's chosen sort order.
  // Groups themselves are sorted by their aggregate using the same column +
  // direction so ranking is consistent whether you look at the package roll-up
  // or its contents. Rows without a `packageName` (project-relative paths)
  // render flat as before.
  const renderItems = useMemo(
    () => buildRenderItems(filtered, sortColumn, sortDirection, useCompressed),
    [filtered, sortColumn, sortDirection, useCompressed]
  )

  const totalDelta = useCompressed
    ? summary.totalCompressedB - summary.totalCompressedA
    : summary.totalB - summary.totalA

  return (
    <div className="flex h-full flex-col">
      {caption ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <span className="text-sm font-medium text-foreground">{caption}</span>
        </div>
      ) : null}

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <SortableHeader
                label={nameHeading}
                column="name"
                activeColumn={sortColumn}
                direction={sortDirection}
                onClick={onHeaderClick}
                align="left"
                trailing={
                  !isSingle ? (
                    <DiffStatusFilter
                      value={statusFilter}
                      onChange={setStatusFilter}
                      counts={summary.counts}
                    />
                  ) : null
                }
              />
              {!isSingle ? (
                <SortableHeader
                  label={aHeading}
                  column="a"
                  activeColumn={sortColumn}
                  direction={sortDirection}
                  onClick={onHeaderClick}
                  title="Historical build (before)"
                  align="right"
                />
              ) : null}
              <SortableHeader
                label={isSingle ? 'Size' : bHeading}
                column="b"
                activeColumn={sortColumn}
                direction={sortDirection}
                onClick={onHeaderClick}
                title={isSingle ? undefined : 'Latest build (after)'}
                align="right"
              />
              {!isSingle ? (
                <SortableHeader
                  label="Δ"
                  column="delta"
                  activeColumn={sortColumn}
                  direction={sortDirection}
                  onClick={onHeaderClick}
                  align="right"
                />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {renderItems.flatMap((item) => {
              if (item.kind === 'group') {
                const isExpanded = expandedPackages.has(item.packageName)
                const header = (
                  <DiffPackageHeaderRow
                    key={`pkg:${item.packageName}`}
                    packageName={item.packageName}
                    rows={item.rows}
                    useCompressed={useCompressed}
                    isExpanded={isExpanded}
                    onToggle={() => togglePackage(item.packageName)}
                    mode={mode}
                  />
                )
                if (!isExpanded) return [header]
                return [
                  header,
                  ...item.rows.map((row) => (
                    <DiffTableRow
                      key={`pkg:${item.packageName}:${row.key}`}
                      row={row}
                      useCompressed={useCompressed}
                      indent
                      onClick={onRowSelect ? () => onRowSelect(row) : undefined}
                      isSelected={selectedKey === row.key}
                      mode={mode}
                    />
                  )),
                ]
              }
              return [
                <DiffTableRow
                  key={item.row.key}
                  row={item.row}
                  useCompressed={useCompressed}
                  onClick={
                    onRowSelect ? () => onRowSelect(item.row) : undefined
                  }
                  isSelected={selectedKey === item.row.key}
                  mode={mode}
                />,
              ]
            })}
            {renderItems.length === 0 ? (
              <tr>
                <td
                  colSpan={isSingle ? 2 : 4}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No matching rows.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot className="sticky bottom-0 bg-background">
            {/*
              Footer cells match the body's `text-xs` + `whitespace-nowrap`
              so size totals (e.g. `259.74 KB`) can't wrap — at `text-sm`
              the unit broke onto a second line in compare mode where the
              numbers are larger.
            */}
            <tr className="border-t border-border text-xs font-medium">
              <td className="px-4 py-2">Total</td>
              {!isSingle ? (
                <td className="whitespace-nowrap px-4 py-2 text-right font-mono">
                  {formatBytes(
                    useCompressed ? summary.totalCompressedA : summary.totalA
                  )}
                </td>
              ) : null}
              <td className="whitespace-nowrap px-4 py-2 text-right font-mono">
                {formatBytes(
                  useCompressed ? summary.totalCompressedB : summary.totalB
                )}
              </td>
              {!isSingle ? (
                <td
                  className={cn(
                    'whitespace-nowrap px-4 py-2 text-right font-mono',
                    totalDelta > 0 && 'text-red-600 dark:text-red-400',
                    totalDelta < 0 && 'text-green-600 dark:text-green-400'
                  )}
                >
                  {formatDelta(totalDelta)}
                </td>
              ) : null}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/** Reads `packageName` off a row without leaking the source-row type. */
function rowPackageName(row: DiffRow): string | undefined {
  return (row as unknown as { packageName?: string }).packageName
}

/**
 * One entry in the rendered table body. Either a package group header, or a
 * leaf row. Children of an expanded group appear as separate `row` items
 * immediately after their group header (`indent: true`).
 */
type RenderItem<Row extends DiffRow> =
  | { kind: 'group'; packageName: string; rows: Row[] }
  | { kind: 'row'; row: Row; indent: boolean }

/**
 * Aggregate stats for a package group, summed across all of its filtered
 * leaves. Mirrors {@link DiffSummary} totals but at the package level.
 */
interface PackageAggregate {
  sizeA: number
  sizeB: number
  compressedA: number
  compressedB: number
  /** Counts of children by status, used to render a compact summary. */
  counts: Record<DiffStatus, number>
  /** Total number of children, regardless of status. */
  total: number
}

function aggregatePackage<Row extends DiffRow>(rows: Row[]): PackageAggregate {
  const agg: PackageAggregate = {
    sizeA: 0,
    sizeB: 0,
    compressedA: 0,
    compressedB: 0,
    counts: { added: 0, removed: 0, changed: 0, identical: 0 },
    total: 0,
  }
  for (const row of rows) {
    agg.sizeA += row.sizeA
    agg.sizeB += row.sizeB
    agg.compressedA += row.compressedA
    agg.compressedB += row.compressedB
    agg.counts[row.status] += 1
    agg.total += 1
  }
  return agg
}

/**
 * Builds the flat list of items to render in `<tbody>`. Source rows that
 * share a `packageName` are grouped under a single header item; project
 * rows are passed through as `row` items.
 *
 * Ordering: groups and ungrouped rows are interleaved in the order their
 * top contributor appeared in `filtered`. This means the existing column
 * sort drives the overall ranking — a package's position is determined by
 * its highest-impact member, which keeps the most interesting groups near
 * the top regardless of which column is active.
 */
function buildRenderItems<Row extends DiffRow>(
  filtered: Row[],
  sortColumn: SortColumn,
  sortDirection: SortDirection,
  useCompressed: boolean
): RenderItem<Row>[] {
  const items: RenderItem<Row>[] = []
  const groupIndex = new Map<string, { rows: Row[]; itemIndex: number }>()

  for (const row of filtered) {
    const pkg = rowPackageName(row)
    if (!pkg) {
      items.push({ kind: 'row', row, indent: false })
      continue
    }
    const existing = groupIndex.get(pkg)
    if (existing) {
      existing.rows.push(row)
    } else {
      const itemIndex = items.length
      const rows: Row[] = [row]
      items.push({ kind: 'group', packageName: pkg, rows })
      groupIndex.set(pkg, { rows, itemIndex })
    }
  }

  // Ensure children within each group are sorted using the same column &
  // direction as the parent table. The first member of each group already
  // appeared in the right top-level position thanks to the pre-sorted input.
  if (groupIndex.size > 0) {
    for (const { rows } of groupIndex.values()) {
      const sortedChildren = sortRows(
        rows,
        sortColumn,
        sortDirection,
        useCompressed
      )
      rows.length = 0
      rows.push(...sortedChildren)
    }
  }

  return items
}

/**
 * Header row for a package group. Renders an expand/collapse chevron, the
 * package name (with package icon), a count of contained rows, and the
 * aggregated A/B/Δ totals — the same shape as a leaf row so columns line up.
 */
function DiffPackageHeaderRow<Row extends DiffRow>({
  packageName,
  rows,
  useCompressed,
  isExpanded,
  onToggle,
  mode = 'compare',
}: {
  packageName: string
  rows: Row[]
  useCompressed: boolean
  isExpanded: boolean
  onToggle: () => void
  mode?: 'compare' | 'single'
}) {
  const isSingle = mode === 'single'
  const agg = aggregatePackage(rows)
  const a = useCompressed ? agg.compressedA : agg.sizeA
  const b = useCompressed ? agg.compressedB : agg.sizeB
  const d = b - a
  const aggregateStatus: DiffStatus =
    a === 0 && b > 0
      ? 'added'
      : a > 0 && b === 0
        ? 'removed'
        : a === b
          ? 'identical'
          : 'changed'

  return (
    <tr
      className={cn(
        'border-b border-border bg-muted/30 transition-colors hover:bg-muted/50',
        'cursor-pointer'
      )}
      onClick={onToggle}
      aria-expanded={isExpanded}
    >
      <td className="w-full max-w-0 px-4 py-2 font-mono text-xs">
        <span className="flex min-w-0 items-center gap-2">
          {isExpanded ? (
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          ) : (
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          )}
          {!isSingle ? <StatusIcon status={aggregateStatus} /> : null}
          <span className="inline-flex min-w-0 shrink items-center gap-1 rounded border border-border bg-background/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Package className="h-3 w-3" aria-hidden />
            <span className="truncate font-mono normal-case text-foreground">
              {packageName}
            </span>
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
            <span className="text-muted-foreground">
              {agg.total} {agg.total === 1 ? 'module' : 'modules'}
            </span>
            {!isSingle ? <PackageCountBreakdown counts={agg.counts} /> : null}
          </span>
        </span>
      </td>
      {!isSingle ? (
        <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs text-muted-foreground">
          {aggregateStatus === 'added' ? '—' : formatBytes(a)}
        </td>
      ) : null}
      <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs text-muted-foreground">
        {aggregateStatus === 'removed' ? '—' : formatBytes(b)}
      </td>
      {!isSingle ? (
        <td
          className={cn(
            'whitespace-nowrap px-4 py-2 text-right font-mono text-xs',
            d > 0 && 'text-red-600 dark:text-red-400',
            d < 0 && 'text-green-600 dark:text-green-400',
            d === 0 && 'text-muted-foreground'
          )}
        >
          {formatDelta(d)}
        </td>
      ) : null}
    </tr>
  )
}

/**
 * Tiny inline summary of how many of each status are inside a package
 * group. Kept extremely compact (single line, only shown statuses) so it
 * sits comfortably next to the package chip.
 */
function PackageCountBreakdown({
  counts,
}: {
  counts: Record<DiffStatus, number>
}) {
  const entries: Array<{ label: string; value: number; className: string }> = [
    {
      label: 'added',
      value: counts.added,
      className: 'text-red-600 dark:text-red-400',
    },
    {
      label: 'removed',
      value: counts.removed,
      className: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'changed',
      value: counts.changed,
      className: 'text-amber-500',
    },
  ]
  const visible = entries.filter((e) => e.value > 0)
  if (visible.length === 0) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-xs">
      {visible.map((e, i) => (
        <span key={e.label} className="inline-flex items-center gap-2">
          {i > 0 ? (
            <span className="text-muted-foreground/40" aria-hidden>
              ·
            </span>
          ) : null}
          <span className={e.className}>
            {e.value} {e.label}
          </span>
        </span>
      ))}
    </span>
  )
}

/**
 * Sorts rows by the chosen column and direction. The `name` column compares
 * using a locale-aware lexicographic ordering; numeric columns compare by
 * value. `identical` rows are always pinned to the bottom — they aren't part
 * of the "what changed" story and would otherwise dominate the top of an
 * ascending sort.
 */
function sortRows<Row extends DiffRow>(
  rows: Row[],
  column: SortColumn,
  direction: SortDirection,
  useCompressed: boolean
): Row[] {
  const sign = direction === 'asc' ? 1 : -1
  const compareKey = (row: Row): number | string => {
    if (column === 'name') return row.name
    if (column === 'a') return useCompressed ? row.compressedA : row.sizeA
    if (column === 'b') return useCompressed ? row.compressedB : row.sizeB
    return delta(row, useCompressed)
  }
  return [...rows].sort((a, b) => {
    if (a.status === 'identical' && b.status !== 'identical') return 1
    if (b.status === 'identical' && a.status !== 'identical') return -1
    const av = compareKey(a)
    const bv = compareKey(b)
    if (typeof av === 'string' && typeof bv === 'string') {
      const cmp = av.localeCompare(bv)
      if (cmp !== 0) return cmp * sign
    } else if (typeof av === 'number' && typeof bv === 'number') {
      if (av !== bv) return (av - bv) * sign
    }
    // Stable tiebreaker on key for deterministic ordering.
    return a.key < b.key ? -1 : 1
  })
}

/**
 * A clickable column header that surfaces the current sort state via an
 * adjacent arrow icon. Clicking the active column flips the direction;
 * clicking an inactive column switches to it with a column-appropriate
 * default direction (ascending for text, descending for numbers).
 */
function SortableHeader({
  label,
  column,
  activeColumn,
  direction,
  onClick,
  title,
  align,
  trailing,
}: {
  label: ReactNode
  column: SortColumn
  activeColumn: SortColumn
  direction: SortDirection
  onClick: (column: SortColumn) => void
  title?: string
  align: 'left' | 'right'
  /**
   * Optional content rendered alongside the sort button inside the same
   * `<th>`. Used by the name column to host the diff status filter so the
   * filter pills sit directly next to the column they govern instead of
   * floating in a separate toolbar above the table.
   */
  trailing?: ReactNode
}) {
  const isActive = column === activeColumn
  const Icon = !isActive
    ? ArrowUpDown
    : direction === 'asc'
      ? ArrowUp
      : ArrowDown
  return (
    <th
      className={cn(
        'px-4 py-2 font-medium',
        align === 'right' ? 'text-right' : 'text-left'
      )}
      title={title}
      aria-sort={
        isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <div
        className={cn(
          'flex items-center gap-3',
          align === 'right' ? 'justify-end' : 'justify-start'
        )}
      >
        <button
          type="button"
          onClick={() => onClick(column)}
          className={cn(
            'inline-flex items-center gap-1 uppercase transition-colors hover:text-foreground',
            align === 'right' && 'flex-row-reverse',
            isActive && 'text-foreground'
          )}
        >
          <span>{label}</span>
          <Icon
            className={cn(
              'h-3 w-3 shrink-0',
              isActive ? 'opacity-100' : 'opacity-40'
            )}
            aria-hidden
          />
        </button>
        {trailing}
      </div>
    </th>
  )
}

/** Renders a single row in the diff table. */
function DiffTableRow<Row extends DiffRow>({
  row,
  useCompressed,
  onClick,
  indent = false,
  isSelected = false,
  mode = 'compare',
}: {
  row: Row
  useCompressed: boolean
  onClick?: () => void
  /** When true, the row is rendered as a child of a package group. */
  indent?: boolean
  /** When true, the row is highlighted as the active selection. */
  isSelected?: boolean
  mode?: 'compare' | 'single'
}) {
  const isSingle = mode === 'single'
  const d = delta(row, useCompressed)
  const isInteractive = onClick != null
  return (
    <tr
      className={cn(
        // `group` lets `DiffRowName` reveal env badges only on hover.
        'group border-b border-border last:border-0 transition-colors',
        isInteractive && 'cursor-pointer hover:bg-muted/50',
        indent && 'bg-muted/10',
        isSelected && 'bg-primary/10 hover:bg-primary/15'
      )}
      onClick={onClick}
    >
      <td
        className={cn(
          'w-full max-w-0 py-2 font-mono text-xs',
          indent ? 'pl-12 pr-4' : 'px-4'
        )}
      >
        <DiffRowName
          row={row}
          hidePackageBadge={indent}
          hideStatusIcon={isSingle}
        />
      </td>
      {!isSingle ? (
        <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs text-muted-foreground">
          {row.status === 'added'
            ? '—'
            : formatBytes(useCompressed ? row.compressedA : row.sizeA)}
        </td>
      ) : null}
      <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs text-muted-foreground">
        {row.status === 'removed'
          ? '—'
          : formatBytes(useCompressed ? row.compressedB : row.sizeB)}
      </td>
      {!isSingle ? (
        <td
          className={cn(
            'whitespace-nowrap px-4 py-2 text-right font-mono text-xs',
            d > 0 && 'text-red-600 dark:text-red-400',
            d < 0 && 'text-green-600 dark:text-green-400',
            d === 0 && 'text-muted-foreground'
          )}
        >
          {formatDelta(d)}
        </td>
      ) : null}
    </tr>
  )
}

/**
 * Renders the row name cell. For source rows that live inside an npm package,
 * the package name is rendered as a styled "chip" root (with a package icon)
 * and the rest of the path follows in muted tone — e.g.
 *
 *   📦 react/jsx-runtime.js
 *
 * The original full path is preserved on `title` for hover inspection.
 *
 * Project-relative paths render unchanged.
 */
function DiffRowName<Row extends DiffRow>({
  row,
  hidePackageBadge = false,
  hideStatusIcon = false,
}: {
  row: Row
  /** When true, only render the within-package path (no package chip). Used
   * for rows displayed beneath an expanded package group header where the
   * package name is already visible. */
  hidePackageBadge?: boolean
  /** When true, omit the per-status icon (used in single-build mode where
   * every row is `identical` against itself, making the icon noise). */
  hideStatusIcon?: boolean
}) {
  // Narrow without dragging SourceDiffRow's typings into the generic table.
  const pathKind = (row as unknown as { pathKind?: 'package' | 'project' })
    .pathKind
  const packageName = (row as unknown as { packageName?: string }).packageName
  const client = (row as unknown as { client?: boolean }).client === true
  const server = (row as unknown as { server?: boolean }).server === true

  if (pathKind === 'package' && packageName) {
    const rest = row.name.startsWith(`${packageName}/`)
      ? row.name.slice(packageName.length + 1)
      : ''
    if (hidePackageBadge) {
      return (
        <span className="flex min-w-0 items-center gap-2" title={row.key}>
          {!hideStatusIcon ? <StatusIcon status={row.status} /> : null}
          <span className="truncate text-muted-foreground">
            {rest || packageName}
          </span>
          <EnvBadges client={client} server={server} />
        </span>
      )
    }
    return (
      <span className="flex min-w-0 items-center gap-2" title={row.key}>
        <ChevronSpacer />
        {!hideStatusIcon ? <StatusIcon status={row.status} /> : null}
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Package className="h-3 w-3" aria-hidden />
            <span className="font-mono normal-case text-foreground">
              {packageName}
            </span>
          </span>
          {rest ? (
            <span className="truncate text-muted-foreground">{rest}</span>
          ) : null}
        </span>
        <EnvBadges client={client} server={server} />
      </span>
    )
  }

  return (
    <span className="flex items-center gap-2">
      <ChevronSpacer />
      {!hideStatusIcon ? <StatusIcon status={row.status} /> : null}
      <span className="truncate" title={row.key}>
        {row.name}
      </span>
      <EnvBadges client={client} server={server} />
    </span>
  )
}

/**
 * Invisible placeholder matching a {@link ChevronRight} icon's footprint.
 * Used on non-expandable rows so their status icon aligns horizontally
 * with expandable package-group rows that render a real chevron.
 */
function ChevronSpacer() {
  return <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
}

/**
 * Inline `client` / `server` badges shown only on row hover. Mirrors the
 * treemap hover footer's affordance — environment is signal users want when
 * scanning a single row, but rendering it on every row makes the table
 * noisy. The `group-hover:` reveal relies on the parent `<tr>` declaring
 * `group`. Renders nothing when both flags are false (e.g. aggregate rows
 * where flags weren't computed, or sources absent from both client and
 * server graphs).
 */
function EnvBadges({ client, server }: { client: boolean; server: boolean }) {
  if (!client && !server) return null
  return (
    <span
      className={cn(
        // `invisible` (vs `hidden`) keeps the badges in the flow so the
        // row's height doesn't shift when they appear on hover. They
        // still occupy layout space at rest, but the row's right edge
        // is empty anyway in the name column (the size/delta cells are
        // separate `<td>`s), so this is purely a height-stability fix.
        'ml-auto invisible inline-flex shrink-0 items-center gap-1 pl-2',
        'group-hover:visible'
      )}
      aria-hidden
    >
      {client ? (
        <Badge variant="client" className="text-[10px]">
          client
        </Badge>
      ) : null}
      {server ? (
        <Badge variant="server" className="text-[10px]">
          server
        </Badge>
      ) : null}
    </span>
  )
}

/** Icon shown next to a row name to immediately convey status. */
function StatusIcon({ status }: { status: DiffStatus }) {
  if (status === 'added') {
    return (
      <PlusCircle
        className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400"
        aria-label="Added"
      />
    )
  }
  if (status === 'removed') {
    return (
      <MinusCircle
        className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400"
        aria-label="Removed"
      />
    )
  }
  if (status === 'changed') {
    return (
      <ArrowUp
        className="h-3.5 w-3.5 shrink-0 text-amber-500"
        aria-label="Changed"
      />
    )
  }
  return (
    <Minus
      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
      aria-label="Identical"
    />
  )
}

/** Pill-style filter bar for diff statuses with row counts. */
function DiffStatusFilter({
  value,
  onChange,
  counts,
}: {
  value: DiffStatus | 'all'
  onChange: (value: DiffStatus | 'all') => void
  counts: Record<DiffStatus, number>
}) {
  const total =
    counts.added + counts.removed + counts.changed + counts.identical
  const options: Array<{
    value: DiffStatus | 'all'
    label: string
    count: number
  }> = [
    { value: 'all', label: 'All', count: total },
    { value: 'added', label: 'Added', count: counts.added },
    { value: 'removed', label: 'Removed', count: counts.removed },
    { value: 'changed', label: 'Changed', count: counts.changed },
  ]
  return (
    <div className="flex items-center gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded px-2 py-0.5 text-xs',
            value === opt.value
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.label}
          <Badge variant="secondary" className="ml-1.5 px-1 py-0 text-[10px]">
            {opt.count}
          </Badge>
        </button>
      ))}
    </div>
  )
}
