'use client'

import { Check, ChevronsUpDown, Route } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSuspenseData } from '@/lib/analyzer-data'
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
import { Kbd } from '@/components/ui/kbd'
import {
  delta,
  formatDelta,
  sortByImpact,
  type DiffRow,
  type DiffSummary,
} from '@/lib/diff'

interface RouteTypeaheadProps {
  selectedRoute: string | null
  onRouteSelected: (routeName: string) => void
  /**
   * When provided, the picker renders per-route size deltas next to each
   * route, sorts by largest impact, and uses the diff's route list as its
   * source of truth (so added/removed routes appear with appropriate
   * styling).
   */
  routeDiff?: DiffSummary | null
  /** Whether to use compressed sizes when computing the delta column. */
  useCompressed?: boolean
}

export function RouteTypeahead({
  selectedRoute,
  onRouteSelected,
  routeDiff,
  useCompressed = true,
}: RouteTypeaheadProps) {
  const [open, setOpen] = useState(false)
  const [shortcutLabel, setShortcutLabel] = useState<string | null>(null)

  useEffect(() => {
    const isAppleDevice = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
    setShortcutLabel(isAppleDevice ? '⌘K' : 'Ctrl+K')

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement
      const isInputFocused =
        activeElement && ['INPUT', 'TEXTAREA'].includes(activeElement.tagName)

      if (isInputFocused) return

      const isShortcutPressed = isAppleDevice
        ? e.metaKey && e.key === 'k'
        : e.ctrlKey && e.key === 'k'

      if (isShortcutPressed) {
        e.preventDefault()
        setOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const routes = useSuspenseData<string[]>('/data/routes.json', jsonFetcher, {
    onSuccess: (routeNames) => {
      // Auto-select first route if none is selected
      if (routeNames.length > 0 && selectedRoute == null) {
        onRouteSelected(routeNames[0])
      }
    },
  })

  // When a route diff is provided, sort routes by largest absolute impact so
  // the most-changed route bubbles to the top — matching the rest of the
  // compare UI. Without a diff, fall back to the natural routes.json order.
  const orderedItems = useMemo<RouteItem[]>(() => {
    if (routeDiff) {
      const sorted = sortByImpact(routeDiff.rows, useCompressed)
      return uniqueRouteItems(
        sorted.map((row) => ({
          name: row.key,
          row,
        }))
      )
    }
    return uniqueRouteItems(routes.map((name) => ({ name, row: null })))
  }, [routes, routeDiff, useCompressed])

  // Find the currently selected route's diff row, used to render a delta
  // badge in the trigger button.
  const selectedRow = useMemo(() => {
    if (!routeDiff || !selectedRoute) return null
    return routeDiff.rows.find((r) => r.key === selectedRoute) ?? null
  }, [routeDiff, selectedRoute])

  const ctaText = selectedRoute ?? 'Select route...'

  return (
    <div className="flex min-w-0 items-center gap-2 sm:min-w-64">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={
              selectedRoute
                ? `Select route. Current route: ${selectedRoute}`
                : 'Select route'
            }
            className="w-full min-w-0 justify-between font-mono text-sm"
          >
            <div className="flex min-w-0 flex-1 items-center">
              <Route className="inline mr-2 shrink-0" />

              <span className="min-w-0 flex-1 truncate" title={ctaText}>
                {truncateMiddle(ctaText, 32)}
              </span>
              {selectedRow ? (
                <DeltaBadge row={selectedRow} useCompressed={useCompressed} />
              ) : null}
            </div>
            <div className="ml-2 flex shrink-0 items-center gap-2">
              {shortcutLabel && <Kbd>{shortcutLabel}</Kbd>}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[40rem] max-w-[calc(100vw-1rem)] overflow-hidden p-0"
        >
          <Command className="min-w-0">
            <CommandInput placeholder="Search routes..." className="h-9" />
            <CommandList className="min-w-0">
              <CommandEmpty>No route found.</CommandEmpty>
              <CommandGroup className="min-w-0 [&_[cmdk-group-items]]:min-w-0">
                {orderedItems.map(({ name, row }) => (
                  <CommandItem
                    key={name}
                    value={name}
                    onSelect={() => {
                      onRouteSelected(name)
                      setOpen(false)
                    }}
                    className="w-full min-w-0 overflow-hidden font-mono"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        selectedRoute === name ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="sr-only">{name}</span>
                    <span
                      aria-hidden="true"
                      className="min-w-0 flex-1 truncate"
                      title={name}
                    >
                      {truncateMiddle(name, 64)}
                    </span>
                    {row ? (
                      <DeltaBadge
                        row={row}
                        useCompressed={useCompressed}
                        className="ml-auto"
                      />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

interface RouteItem {
  name: string
  row: DiffRow | null
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value

  const startLength = Math.ceil((maxLength - 1) / 2)
  const endLength = Math.floor((maxLength - 1) / 2)
  return `${value.slice(0, startLength)}…${value.slice(-endLength)}`
}

function uniqueRouteItems(items: RouteItem[]): RouteItem[] {
  const names = new Set<string>()
  return items.filter(({ name }) => {
    if (names.has(name)) return false
    names.add(name)
    return true
  })
}

/**
 * Compact, color-coded badge showing a route's size delta. Hidden when the
 * row has no meaningful change.
 */
function DeltaBadge({
  row,
  useCompressed,
  className,
}: {
  row: DiffRow
  useCompressed: boolean
  className?: string
}) {
  if (row.status === 'identical') return null
  const d = delta(row, useCompressed)
  // For added/removed routes the delta carries the only signal, so always
  // render. For changed routes, suppress sub-byte noise.
  if (row.status === 'changed' && d === 0) return null

  const tone =
    row.status === 'added' || d > 0
      ? 'text-red-600 dark:text-red-400'
      : row.status === 'removed' || d < 0
        ? 'text-green-600 dark:text-green-400'
        : 'text-muted-foreground'

  return (
    <span
      className={cn(
        'ml-2 shrink-0 text-xs tabular-nums font-sans',
        tone,
        className
      )}
    >
      {row.status === 'added'
        ? '+ new'
        : row.status === 'removed'
          ? '− removed'
          : formatDelta(d)}
    </span>
  )
}
