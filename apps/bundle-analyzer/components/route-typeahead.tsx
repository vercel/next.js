'use client'

import useSWR from 'swr'
import { Check, ChevronsUpDown, Loader, Route } from 'lucide-react'
import { forwardRef, useImperativeHandle, useState } from 'react'
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

interface RouteTypeaheadProps {
  selectedRoute: string | null
  onRouteSelected: (routeName: string) => void
}

export interface RouteTypeaheadRef {
  focus: () => void
}

export const RouteTypeahead = forwardRef<
  RouteTypeaheadRef,
  RouteTypeaheadProps
>(function RouteTypeahead({ selectedRoute, onRouteSelected }, ref) {
  const [open, setOpen] = useState(false)

  useImperativeHandle(ref, () => ({
    focus: () => {
      setOpen(true)
    },
  }))

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
      <div className="flex max-w-full text-red-600">
        Failed to load routes manifest: {error.message}
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
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
})
