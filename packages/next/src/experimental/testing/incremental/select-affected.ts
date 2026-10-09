/** Evidence produced by Next's compiler, never by scanning imports here. */
export interface DependencyChange {
  revision: string
  /** Includes entry identity, profiles, and configuration generation. */
  discoveryRevision: string
  affectedEntryIds: readonly string[]
  /** False if any resolution, browser, setup, mock, or data edge is unknown. */
  complete: boolean
}

export interface SelectionInput {
  entryIds: readonly string[]
  previousEntryIds: readonly string[]
  discoveryRevision: string
  /** Undefined means dependency information is unavailable. */
  changes?: readonly DependencyChange[]
  /** Configuration and setup changes with unknown scope invalidate everything. */
  invalidateAll?: boolean
}

export interface AffectedSelection {
  entryIds: string[]
  reason:
    | 'global-invalidation'
    | 'missing-dependencies'
    | 'incomplete-dependencies'
    | 'stale-discovery'
    | 'unknown-entry'
    | 'compiler-dependencies'
}

/**
 * Select in discovery order; newly discovered entries always run and deleted
 * entries never run. This does not load modules, cache execution, or infer a
 * dependency graph. The caller must retain every change since the last run.
 */
export function selectAffectedTests(input: SelectionInput): AffectedSelection {
  const entryIds = [...new Set(input.entryIds)]
  const all = (reason: AffectedSelection['reason']): AffectedSelection => ({
    entryIds,
    reason,
  })

  if (input.invalidateAll) return all('global-invalidation')
  if (input.changes === undefined) return all('missing-dependencies')

  const current = new Set(entryIds)
  const previous = new Set(input.previousEntryIds)
  const affected = new Set(entryIds.filter((id) => !previous.has(id)))

  for (const change of input.changes) {
    if (!change.complete) return all('incomplete-dependencies')
    if (change.discoveryRevision !== input.discoveryRevision) {
      return all('stale-discovery')
    }
    for (const id of change.affectedEntryIds) {
      // A known deleted entry can be omitted; an unrecognized ID indicates
      // that registration and discovery disagree, so narrowing is unsafe.
      if (!current.has(id) && !previous.has(id)) return all('unknown-entry')
      affected.add(id)
    }
  }

  return {
    entryIds: entryIds.filter((id) => affected.has(id)),
    reason: 'compiler-dependencies',
  }
}
