'use client'

import useSWR from 'swr'
import { Check, ChevronsUpDown, Loader, Route } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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

  const {
    data: routes,
    isLoading,
    error,
  } = useSWR<string[]>('data/routes.json', jsonFetcher, {
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
      return sorted.map((row) => ({
        name: row.key,
        row,
      }))
    }
    return (routes ?? []).map((name) => ({ name, row: null }))
  }, [routes, routeDiff, useCompressed])

  // Find the currently selected route's diff row, used to render a delta
  // badge in the trigger button.
  const selectedRow = useMemo(() => {
    if (!routeDiff || !selectedRoute) return null
    return routeDiff.rows.find((r) => r.key === selectedRoute) ?? null
  }, [routeDiff, selectedRoute])

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm max-w-full">
        <span className="font-medium">⚠</span>
        <span className="truncate">
          {error instanceof NetworkError
            ? 'Unable to connect to server'
            : error.message}
        </span>
      </div>
    )
  }

  let ctaText: React.ReactNode
  if (isLoading) {
    ctaText = 'Loading routes...'
  } else if (selectedRoute != null) {
    ctaText = selectedRoute
  } else {
    ctaText = 'Select route...'
  }

  return (
    <div className="flex items-center gap-2 min-w-64 max-w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={isLoading}
            className="flex-grow-1 w-full justify-between font-mono text-sm"
          >
            <div className="flex items-center min-w-0">
              {isLoading ? (
                <Loader className="mr-2 inline animate-spin" />
              ) : (
                <Route className="inline mr-2 shrink-0" />
              )}

              <span className="truncate">{ctaText}</span>
              {selectedRow ? (
                <DeltaBadge row={selectedRow} useCompressed={useCompressed} />
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {shortcutLabel && <Kbd>{shortcutLabel}</Kbd>}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0">
          <Command>
            <CommandInput placeholder="Search routes..." className="h-9" />
            <CommandList>
              <CommandEmpty>No route found.</CommandEmpty>
              <CommandGroup>
                {orderedItems.map(({ name, row }) => (
                  <CommandItem
                    key={name}
                    value={name}
                    onSelect={() => {
                      onRouteSelected(name)
                      setOpen(false)
                    }}
                    className="font-mono"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        selectedRoute === name ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="truncate">{name}</span>
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
