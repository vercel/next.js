import type { SnapshotStateOptions } from '../../../compiled/next-test-primitives'

export type SnapshotUpdateMode = 'none' | 'new' | 'all'

export function resolveSnapshotUpdateMode(options: {
  updateSnapshots?: boolean
  snapshotUpdateMode?: SnapshotUpdateMode
}): SnapshotUpdateMode {
  const mode =
    options.snapshotUpdateMode ?? (options.updateSnapshots ? 'all' : 'none')
  if (mode !== 'none' && mode !== 'new' && mode !== 'all')
    throw new TypeError('Invalid snapshot update mode.')
  return mode
}

/** Bytes cross IPC; executable snapshot environments never do. */
export interface SnapshotUpdate {
  path: string
  /** Null deletes the managed external snapshot file after parent authorization. */
  content: string | null
  previousContent: string | null
}

export interface SnapshotUpdatePlan {
  file: string
  sourceHash?: string
  updates: readonly SnapshotUpdate[]
}

export function stageSnapshotUpdates(
  environment: SnapshotStateOptions['snapshotEnvironment'],
  enabled: boolean
): {
  environment: SnapshotStateOptions['snapshotEnvironment']
  take(): SnapshotUpdate[]
} {
  const previous = new Map<string, string | null>()
  const updates = new Map<string, SnapshotUpdate>()
  return {
    environment: new Proxy(environment, {
      get(target, property) {
        if (property === 'readSnapshotFile') {
          return async (path: string) => {
            const content = await target.readSnapshotFile(path)
            // The primitive rereads while saving. Only its initial read is the
            // version our generated snapshot content was based on.
            if (!previous.has(path)) previous.set(path, content)
            return content
          }
        }
        if (property === 'saveSnapshotFile') {
          return async (path: string, content: string) => {
            if (!enabled) return
            if (!previous.has(path))
              throw new Error(
                'Snapshot update requires its original file bytes.'
              )
            if (content !== previous.get(path)) {
              updates.set(path, {
                path,
                content,
                previousContent: previous.get(path)!,
              })
            }
          }
        }
        if (property === 'removeSnapshotFile') {
          return async (path: string) => {
            if (!enabled) return
            if (!previous.has(path))
              throw new Error(
                'Snapshot deletion requires its original file bytes.'
              )
            const previousContent = previous.get(path)!
            if (previousContent !== null)
              updates.set(path, { path, content: null, previousContent })
          }
        }
        const value = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }),
    take() {
      const result = [...updates.values()]
      updates.clear()
      return result
    },
  }
}
