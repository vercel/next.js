'use client'

import type React from 'react'
import { CircleHelp } from 'lucide-react'
import type {
  OwnSideEffects,
  TransitiveSideEffects,
  UsedExports,
} from '@/lib/analyze-data'
import { diffTreeShaking, type TreeShakingInfo } from '@/lib/tree-shaking'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'

export type ComparisonTreeShakingSide =
  | { status: 'available'; info: TreeShakingInfo }
  | { status: 'unavailable' }
  | { status: 'not-present' }

const MAX_INLINE_EXPORTS = 5

export function TreeShakingDetails({ info }: { info: TreeShakingInfo }) {
  return (
    <section
      data-tree-shaking
      className="space-y-1.5 border-t border-border/70 pt-3"
    >
      <TreeShakingHeading />
      <TreeShakingRows info={info} />
    </section>
  )
}

export function TreeShakingComparison({
  a,
  b,
  aLabel,
  bLabel,
}: {
  a: ComparisonTreeShakingSide
  b: ComparisonTreeShakingSide
  aLabel: string
  bLabel: string
}) {
  const bothAvailable = a.status === 'available' && b.status === 'available'

  return (
    <section
      data-tree-shaking
      className="space-y-1.5 border-t border-border/70 pt-3"
    >
      <TreeShakingHeading />
      <p
        className="truncate text-[10px] leading-none text-muted-foreground"
        title={`${aLabel} to ${bLabel}`}
      >
        {aLabel} → {bLabel}
      </p>
      {bothAvailable ? (
        <TreeShakingDiffRows before={a.info} after={b.info} />
      ) : (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <ComparisonTreeShakingValue label={aLabel} side={a} />
          <ComparisonTreeShakingValue label={bLabel} side={b} />
        </div>
      )}
    </section>
  )
}

function TreeShakingHeading() {
  return (
    <h3 className="flex items-center text-xs font-semibold leading-none text-foreground">
      Tree shaking
      <InlineHelpTooltip>
        Turbopack's export usage and side-effect analysis for this source.
        Sources with multiple internal module fragments are summarized
        conservatively.
      </InlineHelpTooltip>
    </h3>
  )
}

function TreeShakingRows({ info }: { info: TreeShakingInfo }) {
  return (
    <dl className="space-y-1 text-[11px]">
      <TreeShakingRow
        label="Used exports"
        help="Exports retained by the module graph. evaluation means only top-level evaluation is needed; all means usage could not be narrowed."
      >
        <UsedExportsValue value={info.usedExports} />
      </TreeShakingRow>
      <TreeShakingRow
        label="This module"
        help={`Whether this module's own evaluation can cause side effects. Turbopack state: ${info.ownSideEffects}.`}
      >
        <SideEffectValue
          value={info.ownSideEffects}
          label={ownSideEffectLabel(info.ownSideEffects)}
        />
      </TreeShakingRow>
      <TreeShakingRow
        label="Including dependencies"
        help={`Whether evaluating this module or its evaluation dependencies can cause side effects. Turbopack state: ${info.transitiveSideEffects}.`}
      >
        <SideEffectValue
          value={info.transitiveSideEffects}
          label={transitiveSideEffectLabel(info.transitiveSideEffects)}
        />
      </TreeShakingRow>
    </dl>
  )
}

function TreeShakingRow({
  label,
  help,
  children,
}: {
  label: string
  help: string
  children: React.ReactNode
}) {
  return (
    <div
      data-tree-shaking-field={label}
      className="flex items-start justify-between gap-3"
    >
      <dt className="flex shrink-0 items-center leading-4 text-muted-foreground">
        {label}
        <InlineHelpTooltip>{help}</InlineHelpTooltip>
      </dt>
      <dd className="flex min-w-0 justify-end text-right leading-4">
        {children}
      </dd>
    </div>
  )
}

function UsedExportsValue({ value }: { value: UsedExports }) {
  if (!Array.isArray(value)) {
    return <code className="font-mono leading-4 text-foreground">{value}</code>
  }
  if (value.length === 0) {
    return <span className="text-muted-foreground">none</span>
  }
  const visibleExports = value.slice(0, MAX_INLINE_EXPORTS)
  const hiddenCount = value.length - visibleExports.length
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {visibleExports.map((name) => (
        <code
          key={name}
          className="break-all rounded bg-background/80 px-1 font-mono text-[10px] text-foreground"
        >
          {name}
        </code>
      ))}
      {hiddenCount > 0 ? (
        <OverflowTooltip hiddenCount={hiddenCount} label="All used exports">
          <div
            data-tree-shaking-export-list
            className="flex max-h-48 flex-wrap gap-1 overflow-y-auto"
          >
            {value.map((name) => (
              <code
                key={name}
                className="rounded bg-background/80 px-1 font-mono text-[10px] text-foreground"
              >
                {name}
              </code>
            ))}
          </div>
        </OverflowTooltip>
      ) : null}
    </span>
  )
}

type SideEffectState = OwnSideEffects | TransitiveSideEffects

function ownSideEffectLabel(value: OwnSideEffects): string {
  switch (value) {
    case 'free':
      return 'Declared side-effect free'
    case 'evaluation-free':
      return 'No direct side effects'
    case 'effectful':
      return 'May have direct side effects'
  }
}

function transitiveSideEffectLabel(value: TransitiveSideEffects): string {
  return value === 'free' ? 'No side effects' : 'May have side effects'
}

function SideEffectValue({
  value,
  label,
}: {
  value: SideEffectState
  label: string
}) {
  return (
    <span
      className={cn(
        'leading-4',
        value === 'free' && 'text-green-600 dark:text-green-400',
        value === 'evaluation-free' && 'text-green-600 dark:text-green-400',
        value === 'effectful' && 'text-red-600 dark:text-red-400'
      )}
    >
      {label}
    </span>
  )
}

function ComparisonTreeShakingValue({
  label,
  side,
}: {
  label: string
  side: ComparisonTreeShakingSide
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p
        className="truncate text-[11px] font-medium text-foreground"
        title={label}
      >
        {label}
      </p>
      {side.status === 'available' ? (
        <TreeShakingRows info={side.info} />
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {side.status === 'not-present' ? 'Not present' : 'Unavailable'}
        </p>
      )}
    </div>
  )
}

function TreeShakingDiffRows({
  before,
  after,
}: {
  before: TreeShakingInfo
  after: TreeShakingInfo
}) {
  const diff = diffTreeShaking(before, after)
  return (
    <dl className="space-y-1 text-[11px]">
      <TreeShakingRow
        label="Used exports"
        help="Added exports are shown with + and removed exports with −. Other usage modes are shown as an A-to-B transition."
      >
        <UsedExportsDiffValue diff={diff.usedExports} />
      </TreeShakingRow>
      <TreeShakingRow
        label="This module"
        help={`Change in whether the module's own evaluation can cause side effects. Turbopack states: ${diff.ownSideEffects.before} → ${diff.ownSideEffects.after}.`}
      >
        <SideEffectDiffValue
          diff={diff.ownSideEffects}
          format={ownSideEffectLabel}
        />
      </TreeShakingRow>
      <TreeShakingRow
        label="Including dependencies"
        help={`Change in side effects from the module and its evaluation dependencies. Turbopack states: ${diff.transitiveSideEffects.before} → ${diff.transitiveSideEffects.after}.`}
      >
        <SideEffectDiffValue
          diff={diff.transitiveSideEffects}
          format={transitiveSideEffectLabel}
        />
      </TreeShakingRow>
    </dl>
  )
}

function UsedExportsDiffValue({
  diff,
}: {
  diff: ReturnType<typeof diffTreeShaking>['usedExports']
}) {
  if (!diff.changed) {
    return <span className="text-muted-foreground">No change</span>
  }
  if (diff.kind === 'exports') {
    const changes = [
      ...diff.added.map((name) => ({
        key: `added-${name}`,
        label: `+${name}`,
        className: 'text-red-600 dark:text-red-400',
      })),
      ...diff.removed.map((name) => ({
        key: `removed-${name}`,
        label: `−${name}`,
        className: 'text-green-600 dark:text-green-400',
      })),
    ]
    const visibleChanges = changes.slice(0, MAX_INLINE_EXPORTS)
    const hiddenCount = changes.length - visibleChanges.length
    return (
      <span className="flex flex-wrap justify-end gap-x-2 gap-y-1 font-mono">
        {visibleChanges.map((change) => (
          <span key={change.key} className={change.className}>
            {change.label}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <OverflowTooltip hiddenCount={hiddenCount} label="All export changes">
            <div className="flex max-h-48 flex-wrap gap-x-2 gap-y-1 overflow-y-auto font-mono">
              {changes.map((change) => (
                <span key={change.key} className={change.className}>
                  {change.label}
                </span>
              ))}
            </div>
          </OverflowTooltip>
        ) : null}
      </span>
    )
  }
  return (
    <span className="flex min-w-0 items-center justify-end gap-1">
      <UsedExportsValue value={diff.before} />
      <span className="shrink-0 text-muted-foreground">→</span>
      <UsedExportsValue value={diff.after} />
    </span>
  )
}

function SideEffectDiffValue<T extends SideEffectState>({
  diff,
  format,
}: {
  diff: {
    before: T
    after: T
    changed: boolean
  }
  format: (value: T) => string
}) {
  if (!diff.changed) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <SideEffectValue value={diff.after} label={format(diff.after)} />
        <span className="text-muted-foreground">No change</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <SideEffectValue value={diff.before} label={format(diff.before)} />
      <span className="text-muted-foreground">→</span>
      <SideEffectValue value={diff.after} label={format(diff.after)} />
    </span>
  )
}

function OverflowTooltip({
  hiddenCount,
  label,
  children,
}: {
  hiddenCount: number
  label: string
  children: React.ReactNode
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-tree-shaking-more-exports
            className="rounded bg-background/80 px-1 text-[10px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
          >
            and {hiddenCount} more
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm space-y-1.5" side="top" align="end">
          <p className="text-[10px] font-medium text-muted-foreground">
            {label}
          </p>
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function InlineHelpTooltip({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="More information"
            className="ml-0.5 inline-flex text-muted-foreground transition-colors hover:text-foreground"
          >
            <CircleHelp size={12} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs" side="top" align="center">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
