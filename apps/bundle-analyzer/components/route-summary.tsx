'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Monitor } from 'lucide-react'
import { RouteTypeahead } from '@/components/route-typeahead'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { RouteSummarySkeleton } from '@/components/ui/skeleton'
import { useSuspenseJsonData } from '@/lib/analyzer-data'
import type { RouteSummary, RouteSizeTotals } from '@/lib/diff'
import { formatBytes } from '@/lib/utils'

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
  const routes = useSuspenseJsonData<string[]>('/data/routes.json', {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  })
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
  const [pickerOpen, setPickerOpen] = useState(false)

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
            open={pickerOpen}
            onOpenChange={setPickerOpen}
          />
        </div>
      </div>
      <RouteOverview
        routes={routes}
        clientRouteTotals={clientRouteTotals}
        onOpenPicker={() => setPickerOpen(true)}
      />
    </main>
  )
}

function RouteOverview({
  routes,
  clientRouteTotals,
  onOpenPicker,
}: {
  routes: string[]
  clientRouteTotals: ReadonlyMap<string, RouteSizeTotals>
  onOpenPicker: () => void
}) {
  const [visibleRouteCount, setVisibleRouteCount] = useState(15)
  const [routePickerShortcut, setRoutePickerShortcut] = useState('⌘K')

  useEffect(() => {
    if (!/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)) {
      setRoutePickerShortcut('Ctrl+K')
    }
  }, [])

  const rankedRoutes = routes
    .map((route) => ({
      route,
      compressedSize: clientRouteTotals.get(route)?.compressedSize ?? 0,
    }))
    .sort((left, right) => right.compressedSize - left.compressedSize)
  const visibleRoutes = rankedRoutes.slice(0, visibleRouteCount)
  const remainingRouteCount = rankedRoutes.length - visibleRoutes.length

  return (
    <div className="flex flex-1 justify-center overflow-auto px-6 py-12">
      <section
        className="w-full max-w-3xl"
        aria-labelledby="route-overview-title"
      >
        <div className="mb-6 flex items-start justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Monitor className="h-4 w-4" />
              Client bundles
            </div>
            <h1 id="route-overview-title" className="text-2xl font-semibold">
              Largest client payloads
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Start with the routes that send the most compressed code to the
              browser.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm tabular-nums text-muted-foreground">
              {routes.length} routes
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenPicker}
            >
              Find any route
              <Kbd>{routePickerShortcut}</Kbd>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border bg-card">
          {visibleRoutes.map(({ route, compressedSize }, index) => (
            <Link
              key={route}
              href={{ pathname: '/analyze', query: { route } }}
              className="group flex w-full items-center gap-4 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent"
            >
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-sm">
                {route}
              </span>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {formatBytes(compressedSize)}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
          ))}
          {remainingRouteCount > 0 ? (
            <button
              type="button"
              className="flex w-full items-center justify-center px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setVisibleRouteCount((count) => count + 10)}
            >
              Show {Math.min(10, remainingRouteCount)} more
            </button>
          ) : null}
        </div>
      </section>
    </div>
  )
}
