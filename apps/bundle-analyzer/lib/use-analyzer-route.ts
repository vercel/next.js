import { CompareView, Environment } from '@/components/top-bar'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  decodeBuildSelection,
  encodeBuildSelection,
  snapshotBaseDir,
  type SnapshotMetadata,
} from './snapshot'

export function useAnalyzerRoute(
  compare: boolean,
  snapshots: SnapshotMetadata[] | undefined,
  latestSnapshot: SnapshotMetadata
) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedRoute = searchParams.get('route')
  const singleBuildName = compare
    ? null
    : decodeBuildSelection(searchParams.get('build') ?? 'latest')
  const invalidSingleBuild = !compare && singleBuildName === undefined
  const singleSnapshot =
    typeof singleBuildName === 'string'
      ? (snapshots?.find((snapshot) => snapshot.name === singleBuildName) ??
        null)
      : null
  const fromName = compare
    ? decodeBuildSelection(searchParams.get('from'))
    : undefined
  const toName = compare
    ? decodeBuildSelection(searchParams.get('to') ?? 'latest')
    : null
  const invalidComparison =
    compare &&
    (toName === undefined ||
      (toName !== null &&
        !snapshots?.some((snapshot) => snapshot.name === toName)))
  const baselineSnapshot = compare
    ? fromName === null
      ? latestSnapshot
      : (snapshots?.find((snapshot) => snapshot.name === fromName) ?? null)
    : null
  const comparisonSnapshot = compare
    ? (snapshots?.find((snapshot) => snapshot.name === toName) ?? null)
    : singleSnapshot
  const activeBaseDir = comparisonSnapshot
    ? snapshotBaseDir(comparisonSnapshot)
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
    fromName,
    invalidComparison,
    invalidSingleBuild,
    singleBuildName: singleBuildName ?? null,
    singleSnapshot,
    toName,
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
    setSingleBuild: (name: string | null) =>
      navigate(
        '/analyze',
        {
          build: name === null ? null : encodeBuildSelection(name),
          from: null,
          to: null,
        },
        'push'
      ),
    setComparison: (from: string | null, to: string | null) =>
      navigate(
        '/compare',
        {
          from: encodeBuildSelection(from),
          to: to === null ? null : encodeBuildSelection(to),
          build: null,
        },
        pathname === '/compare' && fromName === from ? 'replace' : 'push'
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
