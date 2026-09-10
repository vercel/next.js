import { CompareView } from '@/components/top-bar'
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
      : compare
        ? CompareView.Table
        : CompareView.Treemap

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

  return {
    baselineSnapshot,
    comparisonSnapshot,
    compareView,
    selectedRoute,
    setView: (view: CompareView) => navigate(pathname, { view }, 'replace'),
    setRoute: (route: string | null) =>
      navigate(pathname, { route }, 'replace'),
    startComparison: (snapshot: SnapshotMetadata) =>
      navigate('/compare', { from: snapshot.id, to: null, view: null }, 'push'),
    stopComparison: () =>
      navigate('/', { from: null, to: null, view: null }, 'push'),
    setComparisonSnapshot: (snapshot: SnapshotMetadata | null) =>
      navigate(pathname, { to: snapshot?.id ?? null }, 'replace'),
  }
}
