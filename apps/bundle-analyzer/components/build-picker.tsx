'use client'

import { useState } from 'react'
import { ChevronsUpDown, GitCompareArrows } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  encodeBuildSelection,
  formatRelativeTime,
  formatSnapshotLabel,
  type SnapshotMetadata,
} from '@/lib/snapshot'
import { cn } from '@/lib/utils'

type BuildName = string | null
type PickerMode = 'single' | 'compare'

interface BuildPickerProps {
  compareMode: boolean
  historySnapshots: SnapshotMetadata[]
  historyLoading: boolean
  historyError: boolean
  latestSnapshot: SnapshotMetadata
  singleBuildName: string | null
  fromName: string | null | undefined
  toName: string | null | undefined
  onSingleBuildChange: (id: BuildName) => void
  onComparisonChange: (from: BuildName, to: BuildName) => void
}

export function BuildPicker({
  compareMode,
  historySnapshots,
  historyLoading,
  historyError,
  latestSnapshot,
  singleBuildName,
  fromName,
  toName,
  onSingleBuildChange,
  onComparisonChange,
}: BuildPickerProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PickerMode>(
    compareMode ? 'compare' : 'single'
  )
  const [search, setSearch] = useState('')

  const snapshots = historySnapshots.filter(
    (snapshot) => snapshot.name !== latestSnapshot.name
  )
  const builds = [null, ...snapshots.map((snapshot) => snapshot.name)]
  const selectedFrom: BuildName | undefined = compareMode
    ? fromName === undefined
      ? snapshots[0]?.name
      : fromName
    : (singleBuildName ?? snapshots[0]?.name)
  const selectedTo: BuildName | undefined = compareMode ? toName : null

  function getLabel(id: BuildName | undefined) {
    if (id === null) return 'Latest'
    if (id === undefined) return 'Select build'
    const snapshot = snapshots.find((item) => item.name === id)
    return snapshot ? formatSnapshotLabel(snapshot) : 'Unknown build'
  }

  function selectComparison(side: 'from' | 'to', id: BuildName) {
    if (selectedFrom === undefined || selectedTo === undefined) return
    if (side === 'from') {
      onComparisonChange(id, id === selectedTo ? selectedFrom : selectedTo)
    } else {
      onComparisonChange(id === selectedFrom ? selectedTo : selectedFrom, id)
    }
  }

  const query = search.trim().toLowerCase()
  const visibleBuilds = builds.filter((id) => {
    if (!query) return true
    if (id === null) return 'latest'.includes(query)
    const snapshot = snapshots.find((item) => item.name === id)!
    return [
      snapshot.name,
      snapshot.gitBranch,
      snapshot.gitShortSha,
      snapshot.gitMessage,
      formatSnapshotLabel(snapshot),
    ]
      .filter(Boolean)
      .some((part) => part!.toLowerCase().includes(query))
  })

  const triggerLabel = compareMode
    ? `${getLabel(fromName)} → ${getLabel(toName)}`
    : getLabel(singleBuildName)

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setMode(compareMode ? 'compare' : 'single')
          setSearch('')
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-expanded={open}
          aria-label={`Select builds. ${triggerLabel}`}
          className="w-max shrink-0 gap-2 px-3"
        >
          <GitCompareArrows className="shrink-0" />
          <span className="text-sm">{triggerLabel}</span>
          <ChevronsUpDown className="shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[28rem] max-w-[calc(100vw-1rem)] p-0"
      >
        <div
          className="flex gap-1 border-b p-2"
          role="group"
          aria-label="Build selection mode"
        >
          {(['single', 'compare'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm',
                mode === item
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item === 'single' ? 'Single build' : 'Compare builds'}
            </button>
          ))}
        </div>
        <div className="p-2">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search builds…"
            aria-label="Search builds"
            className="mb-2 h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {mode === 'compare' ? (
            <div className="flex border-b pb-1 text-center text-xs font-medium text-muted-foreground">
              <span className="w-11">From</span>
              <span className="w-11">To</span>
              <span className="flex-1 text-left pl-2">Build</span>
            </div>
          ) : null}
          <div className="max-h-80 overflow-y-auto">
            {visibleBuilds.map((id) => {
              const snapshot =
                id === null
                  ? latestSnapshot
                  : snapshots.find((item) => item.name === id)!
              const label =
                id === null ? 'Latest' : formatSnapshotLabel(snapshot)
              return (
                <div
                  key={encodeBuildSelection(id)}
                  className="flex min-h-14 items-center border-b last:border-b-0"
                >
                  {mode === 'compare' ? (
                    <>
                      <SelectionCell
                        side="from"
                        label={label}
                        selected={selectedFrom === id}
                        disabled={
                          selectedFrom === undefined || selectedTo === undefined
                        }
                        onClick={() => selectComparison('from', id)}
                      />
                      <SelectionCell
                        side="to"
                        label={label}
                        selected={selectedTo === id}
                        disabled={
                          selectedFrom === undefined || selectedTo === undefined
                        }
                        onClick={() => selectComparison('to', id)}
                      />
                      <div className="min-w-0 flex-1 py-2 pl-2 pr-2 text-left">
                        <BuildRow snapshot={snapshot} latest={id === null} />
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      aria-label={`View ${label}`}
                      aria-pressed={!compareMode && singleBuildName === id}
                      className="flex min-w-0 flex-1 items-center hover:bg-muted"
                      onClick={() => {
                        onSingleBuildChange(id)
                      }}
                    >
                      <span className="flex w-11 shrink-0 justify-center">
                        <SelectionMark
                          selected={!compareMode && singleBuildName === id}
                        />
                      </span>
                      <span className="min-w-0 flex-1 py-2 pl-2 pr-2 text-left">
                        <BuildRow snapshot={snapshot} latest={id === null} />
                      </span>
                    </button>
                  )}
                </div>
              )
            })}
            {visibleBuilds.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No builds found.
              </div>
            ) : null}
          </div>
          {historyError ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Unable to load build history.
            </p>
          ) : mode === 'compare' &&
            snapshots.length === 0 &&
            !historyLoading ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Run another build with analyze enabled to compare two builds.
            </p>
          ) : null}
          {historyLoading ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Loading history…
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SelectionCell({
  side,
  label,
  selected,
  disabled,
  onClick,
}: {
  side: 'from' | 'to'
  label: string
  selected: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${side === 'from' ? 'From' : 'To'} ${label}`}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-11 self-stretch items-center justify-center disabled:opacity-40',
        side === 'from'
          ? 'bg-rose-100/70 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70'
          : 'bg-emerald-100/70 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70'
      )}
    >
      <SelectionMark selected={selected} />
    </button>
  )
}

function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        'flex size-4 items-center justify-center rounded-full border',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background'
      )}
    >
      {selected ? (
        <span className="size-1.5 rounded-full bg-primary-foreground" />
      ) : null}
    </span>
  )
}

function BuildRow({
  snapshot,
  latest,
}: {
  snapshot: SnapshotMetadata
  latest: boolean
}) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium">
        {latest ? 'Latest' : formatSnapshotLabel(snapshot)}
        {snapshot.gitDirty ? (
          <span className="ml-2 text-xs text-amber-600">dirty</span>
        ) : null}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {snapshot.gitMessage ? `${snapshot.gitMessage} · ` : ''}
        {formatRelativeTime(snapshot.createdAt)} · {snapshot.routeCount} routes
      </span>
    </span>
  )
}
