import { CompareView, Environment } from '@/components/top-bar'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { SnapshotMetadata } from './snapshot'

export function useAnalyzerRoute(
  compare: boolean,
  snapshots: SnapshotMetadata[] | undefined
) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedRoute = searchParams.get('route')
  const baselineSnapshot = compare
    ? (snapshots?.find(
        (snapshot) => snapshot.id === searchParams.get('from')
      ) ?? null)
    : null
  const comparisonSnapshot = compare
    ? (snapshots?.find((snapshot) => snapshot.id === searchParams.get('to')) ??
      null)
    : null
  const viewParam = searchParams.get('view')
  const compareView =
    viewParam === CompareView.Table || viewParam === CompareView.Treemap
      ? viewParam
      : CompareView.Treemap
  const environmentParam = searchParams.get('environment')
  const environmentFilter =
    environmentParam === Environment.Server
      ? Environment.Server
      : Environment.Client
  const searchQuery = searchParams.get('query') ?? ''
  const typeFilter = parseTypeFilter(searchParams.get('types'))

  function navigate(
    nextPathname: string,
    updates: Record<string, string | null>,
    method: 'push' | 'replace'
  ) {
    const nextSearchParams = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value == null) nextSearchParams.delete(key)
      else nextSearchParams.set(key, value)
    }
    const query = nextSearchParams.toString()
    router[method](`${nextPathname}${query ? `?${query}` : ''}`)
  }

  function replaceSearchParams(updates: Record<string, string | null>) {
    const nextSearchParams = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value == null) nextSearchParams.delete(key)
      else nextSearchParams.set(key, value)
    }
    const query = nextSearchParams.toString()
    window.history.replaceState(
      null,
      '',
      `${pathname}${query ? `?${query}` : ''}`
    )
  }

  function startComparison(snapshot: SnapshotMetadata) {
    navigate('/compare', { from: snapshot.id, to: null }, 'push')
  }

  return {
    baselineSnapshot,
    comparisonSnapshot,
    compareView,
    environmentFilter,
    searchQuery,
    selectedRoute,
    typeFilter,
    setView: (view: CompareView) => navigate(pathname, { view }, 'replace'),
    setRoute: (route: string | null) => {
      const leavingSummary = pathname === '/' && route != null
      navigate(
        leavingSummary ? '/analyze' : pathname,
        { route },
        leavingSummary ? 'push' : 'replace'
      )
    },
    startComparison,
    stopComparison: () =>
      navigate('/analyze', { from: null, to: null }, 'push'),
    setComparisonSnapshot: (snapshot: SnapshotMetadata | null) =>
      navigate(pathname, { to: snapshot?.id ?? null }, 'replace'),
    setEnvironmentFilter: (environment: Environment) =>
      replaceSearchParams({
        environment: environment === Environment.Client ? null : environment,
      }),
    setSearchQuery: (query: string) =>
      replaceSearchParams({ query: query || null }),
    setTypeFilter: (types: string[]) =>
      replaceSearchParams({
        types: arraysEqual(types, DEFAULT_TYPE_FILTER)
          ? null
          : normalizeTypeFilter(types).join(','),
      }),
  }
}

const TYPE_FILTER_VALUES = ['js', 'css', 'json', 'asset'] as const
const DEFAULT_TYPE_FILTER = TYPE_FILTER_VALUES.slice(0, 3)

function normalizeTypeFilter(types: string[]): string[] {
  const selected = new Set(types)
  const normalized = TYPE_FILTER_VALUES.filter((type) => selected.has(type))
  return normalized.length > 0 ? normalized : DEFAULT_TYPE_FILTER
}

function parseTypeFilter(value: string | null): string[] {
  return value ? normalizeTypeFilter(value.split(',')) : DEFAULT_TYPE_FILTER
}

function arraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}
