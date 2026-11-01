'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  RouteTypeahead,
  RouteTypeaheadContent,
} from '@/components/route-typeahead'
import { RouteSummarySkeleton } from '@/components/ui/skeleton'
import { useSuspenseJsonData } from '@/lib/analyzer-data'
import type { RouteSummary, RouteSizeTotals } from '@/lib/diff'

export function RouteSummaryPage() {
  return (
    <Suspense fallback={<RouteSummarySkeleton />}>
      <RouteSummaryContent />
    </Suspense>
  )
}

function RouteSummaryContent() {
  // Read the client URL before Suspense data: static prerendering must bail out
  // before SWR attempts to fetch live analyzer files on the server.
  const searchParams = useSearchParams()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const summaries = useSuspenseJsonData<RouteSummary[]>(
    '/data/route-summaries.json',
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  )
  const clientRouteTotals = new Map<string, RouteSizeTotals>(
    summaries.map(({ route, client }) => [
      route,
      { size: client.size, compressedSize: client.compressed_size },
    ])
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== '/' ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return
      }

      event.preventDefault()
      searchInputRef.current?.focus()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function getRouteHref(route: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('route', route)
    return `/analyze?${params.toString()}`
  }

  return (
    <main className="h-screen flex flex-col bg-background">
      <div className="flex-none px-4 py-2 border-b border-border flex items-center gap-3">
        <div className="flex min-w-0 flex-1">
          <RouteTypeahead
            selectedRoute={null}
            mode="link"
            getRouteHref={getRouteHref}
            routeTotals={clientRouteTotals}
          />
        </div>
      </div>
      <div className="flex flex-1 justify-center overflow-auto px-6 py-12">
        <section
          className="w-[40rem] max-w-full h-fit"
          aria-labelledby="route-heading"
        >
          <h1 id="route-heading" className="text-2xl font-semibold">
            Analyze a route
          </h1>
          <p className="mt-2 mb-6 text-sm text-muted-foreground">
            Choose a route to explore its bundle size and dependencies.
          </p>
          <div className="overflow-hidden rounded-md border bg-popover">
            <RouteTypeaheadContent
              selectedRoute={null}
              mode="link"
              getRouteHref={getRouteHref}
              routeTotals={clientRouteTotals}
              searchInputRef={searchInputRef}
            />
          </div>
        </section>
      </div>
    </main>
  )
}
