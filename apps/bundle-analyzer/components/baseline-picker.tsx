'use client'

import useSWR from 'swr'
import {
  Check,
  ChevronsUpDown,
  GitCompareArrows,
  Loader,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn, jsonFetcher } from '@/lib/utils'
import { NetworkError } from '@/lib/errors'
import {
  formatRelativeTime,
  formatSnapshotLabel,
  type HistoryIndex,
  type SnapshotMetadata,
} from '@/lib/snapshot'

interface BaselinePickerProps {
  /** Selected snapshot id, or null when no comparison is active. */
  selectedSnapshotId: string | null
  onSelectionChange: (snapshot: SnapshotMetadata | null) => void
}

/**
 * Top-bar control that lets the user pick a historical analyze snapshot to
 * compare the latest build against. When no snapshot is selected, the
 * analyzer behaves as before (single-build view).
 *
 * Snapshots are loaded from `history/history.json` — written by
 * `writeAnalyzeSnapshot` after each `next build --experimental-analyze`.
 */
export function BaselinePicker({
  selectedSnapshotId,
  onSelectionChange,
}: BaselinePickerProps) {
  const [open, setOpen] = useState(false)

  const {
    data: history,
    isLoading,
    error,
  } = useSWR<HistoryIndex>('history/history.json', jsonFetcher, {
    // History rarely changes during a session — avoid spamming refetches.
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // Treat 404 as "no history yet" rather than an error so users on fresh
    // installs see a graceful disabled state instead of a red banner.
    shouldRetryOnError: false,
  })

  // Metadata for the *current* build, so we can exclude its corresponding
  // entry from the history picker (you can't compare a build with itself).
  const { data: currentMetadata } = useSWR<SnapshotMetadata>(
    'data/metadata.json',
    jsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  )

  const allSnapshots = history?.snapshots ?? []
  // Filter out the current build's snapshot — comparing to self is a no-op.
  const snapshots = currentMetadata
    ? allSnapshots.filter((s) => s.id !== currentMetadata.id)
    : allSnapshots
  const selected =
    selectedSnapshotId != null
      ? snapshots.find((s) => s.id === selectedSnapshotId)
      : null

  // Surface only fatal/network problems; missing history files are not errors.
  const hasError = error instanceof NetworkError

  const isEmpty = !isLoading && snapshots.length === 0
  // When the only snapshot on disk is the current build itself, surface a
  // distinct label/tooltip telling the user to run another build.
  const isOnlyCurrentBuild =
    !isLoading && allSnapshots.length > 0 && snapshots.length === 0

  let triggerText: React.ReactNode
  if (isLoading) {
    triggerText = 'Loading history…'
  } else if (selected) {
    triggerText = (
      <span className="flex items-center gap-1.5 truncate">
        <span className="text-muted-foreground text-xs">vs</span>
        <span className="font-mono truncate">
          {formatSnapshotLabel(selected)}
        </span>
      </span>
    )
  } else {
    triggerText = 'Compare with…'
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={isLoading || hasError}
            className="min-w-44 max-w-72 justify-between text-sm"
            title={hasError ? 'Unable to load build history' : undefined}
          >
            <div className="flex items-center min-w-0">
              {isLoading ? (
                <Loader className="mr-2 h-3.5 w-3.5 inline animate-spin" />
              ) : (
                <GitCompareArrows className="mr-2 h-3.5 w-3.5 inline" />
              )}
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
                      next experimental-analyze
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
                      next build --experimental-analyze
                    </code>{' '}
                    to start collecting snapshots.
                  </div>
                </div>
              ) : (
                <CommandEmpty>No snapshots found.</CommandEmpty>
              )}
              <CommandGroup>
                {snapshots.map((snapshot) => (
                  <CommandItem
                    key={snapshot.id}
                    value={`${snapshot.id} ${snapshot.gitBranch ?? ''} ${snapshot.gitShortSha ?? ''}`}
                    onSelect={() => {
                      onSelectionChange(snapshot)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedSnapshotId === snapshot.id
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    <SnapshotRow snapshot={snapshot} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected != null && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Stop comparing"
          onClick={() => onSelectionChange(null)}
          className="h-8 w-8"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
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
