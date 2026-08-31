/**
 * Mirrors {@link SnapshotMetadata} written by the build (see
 * `packages/next/src/build/analyze/snapshot.ts`). Field semantics must stay in
 * sync.
 */
export interface SnapshotMetadata {
  id: string
  createdAt: string
  nextVersion?: string
  gitBranch?: string
  gitSha?: string
  gitShortSha?: string
  gitDirty?: boolean
  appDirOnly?: boolean
  noMangling?: boolean
  routeCount: number
}

/** Mirrors {@link HistoryIndex}. */
export interface HistoryIndex {
  snapshots: SnapshotMetadata[]
}

/**
 * Returns a short, human-friendly label for a snapshot. Used by the picker
 * and the diff header bar. Format prefers branch + short sha, falling back to
 * timestamp when neither is available.
 */
export function formatSnapshotLabel(metadata: SnapshotMetadata): string {
  const sha = metadata.gitShortSha ? metadata.gitShortSha : null
  const branch = metadata.gitBranch ?? null
  if (branch && sha) return `${branch}@${sha}${metadata.gitDirty ? '*' : ''}`
  if (sha) return `${sha}${metadata.gitDirty ? '*' : ''}`
  if (branch) return branch
  return formatRelativeTime(metadata.createdAt)
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
  if (seconds < 45) return 'just now'
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
