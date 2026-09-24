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
        label="Own side effects"
        help="Whether this source's own evaluation can cause side effects. evaluation-free sources may still depend on effectful modules."
      >
        <SideEffectValue value={info.ownSideEffects} />
      </TreeShakingRow>
      <TreeShakingRow
        label="Transitive side effects"
        help="Whether evaluating this source or any of its evaluation dependencies can cause side effects."
      >
        <SideEffectValue value={info.transitiveSideEffects} />
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
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {value.map((name) => (
        <code
          key={name}
          className="break-all rounded bg-background/80 px-1 font-mono text-[10px] text-foreground"
        >
          {name}
        </code>
      ))}
    </span>
  )
}

type SideEffectState = OwnSideEffects | TransitiveSideEffects

function SideEffectValue({ value }: { value: SideEffectState }) {
  return (
    <code
      className={cn(
        'font-mono leading-4',
        value === 'free' && 'text-green-600 dark:text-green-400',
        value === 'evaluation-free' && 'text-amber-600 dark:text-amber-400',
        value === 'effectful' && 'text-red-600 dark:text-red-400'
      )}
    >
      {value}
    </code>
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
        label="Own side effects"
        help="Change in whether the source's own evaluation can cause side effects."
      >
        <SideEffectDiffValue diff={diff.ownSideEffects} />
      </TreeShakingRow>
      <TreeShakingRow
        label="Transitive side effects"
        help="Change in side effects from the source and its evaluation dependencies."
      >
        <SideEffectDiffValue diff={diff.transitiveSideEffects} />
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
    return (
      <span className="flex flex-wrap justify-end gap-x-2 gap-y-1 font-mono">
        {diff.added.map((name) => (
          <span
            key={`added-${name}`}
            className="text-red-600 dark:text-red-400"
          >
            +{name}
          </span>
        ))}
        {diff.removed.map((name) => (
          <span
            key={`removed-${name}`}
            className="text-green-600 dark:text-green-400"
          >
            −{name}
          </span>
        ))}
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

function SideEffectDiffValue({
  diff,
}: {
  diff: {
    before: SideEffectState
    after: SideEffectState
    changed: boolean
  }
}) {
  if (!diff.changed) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <SideEffectValue value={diff.after} />
        <span className="text-muted-foreground">No change</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1">
      <SideEffectValue value={diff.before} />
      <span className="text-muted-foreground">→</span>
      <SideEffectValue value={diff.after} />
    </span>
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
