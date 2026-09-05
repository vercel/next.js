import { cn } from '@/lib/utils'

/**
 * Inline colored delta rendered next to the `A → B` value. For size deltas,
 * positive deltas (regressions) are red and negative (improvements) are
 * emerald — matching how regressions are usually framed. Neutral deltas
 * (counts) render muted.
 */
export function DeltaChip({
  delta,
  tone,
  render,
}: {
  delta: number
  tone: 'neutral' | 'size'
  render: (delta: number) => string
}) {
  const toneClass =
    tone === 'size'
      ? delta > 0
        ? 'text-red-400'
        : delta < 0
          ? 'text-emerald-400'
          : 'text-muted-foreground'
      : 'text-muted-foreground'
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap font-mono text-xs tabular-nums',
        toneClass
      )}
    >
      {render(delta)}
    </span>
  )
}

/**
 * Compact `A → B` card. Used for both counts (Total routes) and sizes
 * (Total size). The delta chip is auto-derived from the values unless an
 * explicit `deltaValue` is provided (e.g. a precomputed compressed delta).
 */
export function StatCard({
  label,
  a,
  b,
  formatValue = (v: number) => String(v),
  deltaValue,
  formatDeltaValue,
  deltaTone,
}: {
  label: string
  a: number | null
  b: number | null
  formatValue?: (value: number) => string
  deltaValue?: number | null
  formatDeltaValue?: (delta: number) => string
  deltaTone: 'neutral' | 'size'
}) {
  const computedDelta =
    deltaValue !== undefined
      ? deltaValue
      : a != null && b != null
        ? b - a
        : null
  const renderDelta =
    formatDeltaValue ??
    ((d: number) => (d === 0 ? '±0' : d > 0 ? `+${d}` : `${d}`))
  return (
    <div className="flex min-w-[112px] flex-1 flex-col gap-1 rounded-md border border-border bg-background/60 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span className="font-mono text-xs tabular-nums text-foreground">
          {a != null ? formatValue(a) : '—'}
        </span>
        <span aria-hidden className="text-xs text-muted-foreground">
          →
        </span>
        <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
          {b != null ? formatValue(b) : '—'}
        </span>
        {computedDelta != null ? (
          <DeltaChip
            delta={computedDelta}
            tone={deltaTone}
            render={renderDelta}
          />
        ) : null}
      </div>
    </div>
  )
}

/** Single-number card for category counts (Added / Removed / etc). */
export function CountCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'added' | 'removed' | 'changed' | 'identical'
}) {
  const toneClass =
    tone === 'added'
      ? 'text-red-500'
      : tone === 'removed'
        ? 'text-green-500'
        : tone === 'changed'
          ? 'text-amber-500'
          : 'text-muted-foreground'
  return (
    <div className="flex min-w-[80px] flex-col gap-1 rounded-md border border-border bg-background/60 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'font-mono text-base font-semibold tabular-nums',
          toneClass
        )}
      >
        {value}
      </div>
    </div>
  )
}
