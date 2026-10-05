import { CompareView, Environment } from '@/components/top-bar'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { SnapshotMetadata } from './snapshot'

export function useAnalyzerRoute(
  compare: boolean,
  snapshots: SnapshotMetadata[] | undefined,
  latestSnapshot: SnapshotMetadata
) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedRoute = searchParams.get('route')
  const singleBuildId = compare ? null : searchParams.get('build')
  const singleSnapshot = singleBuildId
    ? (snapshots?.find((snapshot) => snapshot.id === singleBuildId) ?? null)
    : null
  const fromId = compare ? searchParams.get('from') : null
  const toParam = compare ? searchParams.get('to') : null
  const toId = toParam === 'latest' ? null : toParam
  const invalidComparison =
    compare &&
    toId != null &&
    !snapshots?.some((snapshot) => snapshot.id === toId)
  const baselineSnapshot = compare
    ? fromId === 'latest'
      ? latestSnapshot
      : (snapshots?.find((snapshot) => snapshot.id === fromId) ?? null)
    : null
  const comparisonSnapshot = compare
    ? (snapshots?.find((snapshot) => snapshot.id === toId) ?? null)
    : singleSnapshot
  const activeBaseDir = comparisonSnapshot
    ? `/history/${comparisonSnapshot.id}`
    : '/data'
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

  function buildHref(
    nextPathname: string,
    updates: Record<string, string | null>
  ) {
    const nextSearchParams = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value == null) nextSearchParams.delete(key)
      else nextSearchParams.set(key, value)
    }
    const query = nextSearchParams.toString()
    return `${nextPathname}${query ? `?${query}` : ''}`
  }

  function navigate(
    nextPathname: string,
    updates: Record<string, string | null>,
    method: 'push' | 'replace'
  ) {
    router[method](buildHref(nextPathname, updates))
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

  return {
    activeBaseDir,
    baselineSnapshot,
    comparisonSnapshot,
    fromId,
    invalidComparison,
    singleBuildId,
    singleSnapshot,
    toId,
    compareView,
    environmentFilter,
    searchQuery,
    selectedRoute,
    typeFilter,
    setView: (view: CompareView) => navigate(pathname, { view }, 'replace'),
    setRoute: (route: string | null) =>
      navigate(pathname, { route }, 'replace'),
    getRouteHref:
      pathname === '/'
        ? (route: string) => buildHref('/analyze', { route })
        : undefined,
    setSingleBuild: (id: string | null) =>
      navigate('/analyze', { build: id, from: null, to: null }, 'push'),
    setComparison: (from: string | null, to: string | null) =>
      navigate(
        '/compare',
        { from: from ?? 'latest', to, build: null },
        pathname === '/compare' && fromId === (from ?? 'latest')
          ? 'replace'
          : 'push'
      ),
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
