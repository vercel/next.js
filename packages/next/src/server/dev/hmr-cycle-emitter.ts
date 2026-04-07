/**
 * Event emitter for HMR build cycles.
 *
 * The hot reloader emits `building` when compilation starts and `built` when
 * it finishes (with or without errors). Between start and end, changed entry
 * keys are collected so the emitted result includes which pages were affected.
 */
import type { CompilationError } from './hot-reloader-types'

export interface HmrBuildResult {
  hash: string
  errors: ReadonlyArray<CompilationError>
  warnings: ReadonlyArray<CompilationError>
  changedEntries: ReadonlyArray<string>
  durationMs: number
}

type BuildListener = (result: HmrBuildResult) => void

let buildingStartTime: number | undefined
const pendingChangedEntries = new Set<string>()
const listeners = new Set<BuildListener>()

export function emitHmrBuilding(): void {
  buildingStartTime = Date.now()
  pendingChangedEntries.clear()
}

/**
 * Record that an entry changed during the current build cycle.
 * Called from sendHmr / per-entry subscription handlers.
 */
export function recordChangedEntry(entryKey: string): void {
  pendingChangedEntries.add(entryKey)
}

export function emitHmrBuilt(
  result: Omit<HmrBuildResult, 'durationMs' | 'changedEntries'>,
  durationMs?: number
): void {
  const elapsed =
    durationMs ??
    (buildingStartTime != null ? Date.now() - buildingStartTime : 0)
  buildingStartTime = undefined

  const changedEntries = Array.from(pendingChangedEntries)
  pendingChangedEntries.clear()

  const fullResult: HmrBuildResult = {
    ...result,
    changedEntries,
    durationMs: elapsed,
  }
  for (const listener of listeners) {
    listener(fullResult)
  }
}

/**
 * Subscribe to all future HMR build results.
 * Returns an unsubscribe function.
 */
export function subscribe(listener: BuildListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
