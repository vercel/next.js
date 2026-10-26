/**
 * Mirrors {@link SnapshotMetadata} written by the build (see
 * `packages/next/src/build/analyze/snapshot.ts`). Field semantics must stay in
 * sync.
 */
export interface SnapshotMetadata {
  name: string
  createdAt: string
  nextVersion?: string
  gitBranch?: string
  gitSha?: string
  gitShortSha?: string
  gitDirty?: boolean
  /** First line of the HEAD commit message when available. */
  gitMessage?: string
  appDirOnly?: boolean
  noMangling?: boolean
  routeCount: number
}

/** Mirrors {@link HistoryIndex}. */
export interface HistoryIndex {
  snapshots: SnapshotMetadata[]
}

/** Null selects the live build; undefined means no valid selection. */
export function decodeBuildSelection(
  value: string | null
): string | null | undefined {
  if (value === 'latest') return null
  if (value?.startsWith('snapshot:') && value.length > 'snapshot:'.length) {
    return value.slice('snapshot:'.length)
  }
  return undefined
}

/** Tag saved names so even a snapshot named "latest" is distinct from the live build. */
export function encodeBuildSelection(name: string | null): string {
  return name === null ? 'latest' : `snapshot:${name}`
}

/** The snapshot's name is both its selection key and its display label. */
export function formatSnapshotLabel(metadata: SnapshotMetadata): string {
  return metadata.name
}

/** Mirror the build's snapshotDirectory encoding, then escape the segment for HTTP. */
export function snapshotBaseDir(metadata: SnapshotMetadata): string {
  return `/history/${encodeURIComponent(`snapshot-${encodeURIComponent(metadata.name)}`)}`
}

/**
 * Returns a relative time string for an ISO timestamp ("3m ago", "2h ago",
 * "yesterday", "Jan 4"). Designed for compact list rows.
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diffMs = Date.now() - then
  const seconds = Math.round(diffMs / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
