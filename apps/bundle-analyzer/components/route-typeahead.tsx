'use client'

import useSWR from 'swr'
import { Check, ChevronsUpDown, Loader, Route } from 'lucide-react'
import { useEffect, useState } from 'react'
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

interface RouteTypeaheadProps {
  selectedRoute: string | null
  onRouteSelected: (routeName: string) => void
}

export function RouteTypeahead({
  selectedRoute,
  onRouteSelected,
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

  let ctaText
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
            <div className="flex items-center">
              {isLoading ? (
                <Loader className="mr-2 inline animate-spin" />
              ) : (
                <Route className="inline mr-2" />
              )}

              {ctaText}
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
                {(routes || []).map((route) => {
                  return (
                    <CommandItem
                      key={route}
                      value={route}
                      onSelect={() => {
                        onRouteSelected(route)
                        setOpen(false)
                      }}
                      className="font-mono"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          selectedRoute === route ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {route}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
