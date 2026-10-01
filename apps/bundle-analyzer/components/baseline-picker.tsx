'use client'

import Link from 'next/link'
import { Check, ChevronsUpDown, GitCompareArrows, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandLinkItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useHistoryIndex } from '@/lib/analyzer-data'
import {
  formatRelativeTime,
  formatSnapshotLabel,
  type SnapshotMetadata,
} from '@/lib/snapshot'

interface BaselinePickerOptions {
  /** Selected historical snapshot id, or null for the control's default. */
  selectedSnapshotId: string | null
  excludedSnapshotId?: string | null
  prefix?: string
  placeholder?: string
  clearLabel?: string
}

type BaselinePickerProps = BaselinePickerOptions &
  (
    | {
        mode: 'link'
        getSnapshotHref: (snapshot: SnapshotMetadata) => string
        clearHref: string
        onSelectionChange?: never
      }
    | {
        mode: 'action'
        onSelectionChange: (snapshot: SnapshotMetadata | null) => void
        clearHref?: string
        getSnapshotHref?: never
      }
  )

/**
 * Top-bar control that lets the user pick one historical analyze snapshot.
 * Two instances can select arbitrary A and B snapshots for comparison.
 *
 * Snapshots are loaded from `history/history.json` — written by
 * `writeAnalyzeSnapshot` after each `next build --analyze`.
 */
export function BaselinePicker(props: BaselinePickerProps) {
  const {
    selectedSnapshotId,
    clearHref,
    excludedSnapshotId,
    prefix = 'vs',
    placeholder = 'Compare with…',
    clearLabel = 'Stop comparing',
  } = props
  const [open, setOpen] = useState(false)

  const history = useHistoryIndex()

  const allSnapshots = history.snapshots
  // The index is also the source of truth for the current build's data URL.
  const currentSnapshotId = allSnapshots[0]?.id
  const snapshots = allSnapshots.filter(
    (snapshot) =>
      snapshot.id !== currentSnapshotId && snapshot.id !== excludedSnapshotId
  )
  const selected =
    selectedSnapshotId != null
      ? snapshots.find((s) => s.id === selectedSnapshotId)
      : null

  const isEmpty = snapshots.length === 0
  // When the only snapshot on disk is the current build itself, surface a
  // distinct label/tooltip telling the user to run another build.
  const isOnlyCurrentBuild = allSnapshots.length > 0 && snapshots.length === 0

  let triggerText: React.ReactNode
  if (selected) {
    triggerText = (
      <span className="flex items-center gap-1.5 truncate">
        <span className="text-muted-foreground text-xs">{prefix}</span>
        <span className="font-mono truncate">
          {formatSnapshotLabel(selected)}
        </span>
      </span>
    )
  } else {
    triggerText = placeholder
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="min-w-44 max-w-72 justify-between text-sm"
          >
            <div className="flex items-center min-w-0">
              <GitCompareArrows className="mr-2 h-3.5 w-3.5 inline" />
              <span className="truncate">{triggerText}</span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0">
          <Command>
            {snapshots.length > 0 ? (
              <CommandInput placeholder="Search snapshots…" className="h-9" />
            ) : null}
            <CommandList>
              {isOnlyCurrentBuild ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">
                    No prior builds yet
                  </div>
                  <div className="mt-1">
                    Run{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      next analyze
                    </code>{' '}
                    again to capture a baseline you can compare against.
                  </div>
                </div>
              ) : isEmpty ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  <div className="font-medium text-foreground">
                    No build history
                  </div>
                  <div className="mt-1">
                    Run{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      next build --analyze
                    </code>{' '}
                    to start collecting snapshots.
                  </div>
                </div>
              ) : (
                <CommandEmpty>No snapshots found.</CommandEmpty>
              )}
              <CommandGroup>
                {snapshots.map((snapshot) => {
                  const value = `${snapshot.id} ${snapshot.gitBranch ?? ''} ${snapshot.gitShortSha ?? ''} ${snapshot.gitMessage ?? ''} ${snapshot.snapshotName ?? ''}`
                  const content = (
                    <>
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selectedSnapshotId === snapshot.id
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                      <SnapshotRow snapshot={snapshot} />
                    </>
                  )
                  return props.mode === 'link' ? (
                    <CommandLinkItem
                      key={snapshot.id}
                      value={value}
                      href={props.getSnapshotHref(snapshot)}
                    >
                      {content}
                    </CommandLinkItem>
                  ) : (
                    <CommandItem
                      key={snapshot.id}
                      value={value}
                      onSelect={() => {
                        props.onSelectionChange(snapshot)
                        setOpen(false)
                      }}
                    >
                      {content}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected != null &&
        (clearHref ? (
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={clearHref} aria-label={clearLabel}>
              <X className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : props.mode === 'action' ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={clearLabel}
            onClick={() => props.onSelectionChange(null)}
            className="h-8 w-8"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null)}
    </div>
  )
}

/** A single row in the snapshot picker list. */
function SnapshotRow({ snapshot }: { snapshot: SnapshotMetadata }) {
  return (
    <div className="flex flex-col min-w-0 flex-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-sm truncate">
          {formatSnapshotLabel(snapshot)}
        </span>
        {snapshot.gitDirty ? (
          <span
            title="Working tree was dirty when this snapshot was taken"
            className="text-xs text-amber-600 dark:text-amber-400"
          >
            dirty
          </span>
        ) : null}
      </div>
      {snapshot.gitMessage ? (
        <div className="text-xs text-foreground/70 truncate">
          {snapshot.gitMessage}
        </div>
      ) : null}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatRelativeTime(snapshot.createdAt)}</span>
        <span aria-hidden>·</span>
        <span>
          {snapshot.routeCount} route
          {snapshot.routeCount === 1 ? '' : 's'}
        </span>
        {snapshot.nextVersion ? (
          <>
            <span aria-hidden>·</span>
            <span>v{snapshot.nextVersion}</span>
          </>
        ) : null}
      </div>
    </div>
  )
}
