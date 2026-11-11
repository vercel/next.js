import path from 'path'
import type { FileChange, WatchDirectories } from './watch-files'
import type { WatchSourceErrorSnapshot } from './watch-source-errors'

export interface WatchSourceFailure {
  /** Identifies this observation, never permission to deduplicate another failure. */
  occurrence: number
  error: WatchSourceErrorSnapshot
}
export type WatchSourceRequest =
  | { type: 'watch-source-open'; id: number; directories: WatchDirectories }
  | { type: 'watch-source-update'; id: number; directories: WatchDirectories }
  | { type: 'cancel' }
export type WatchSourceResponse =
  | { type: 'watch-source-ready'; id: number }
  | { type: 'watch-source-updated'; id: number }
  | { type: 'watch-source-change'; change: FileChange }
  | { type: 'watch-source-error'; failure: WatchSourceFailure }
  | {
      type: 'watch-source-operation-failed'
      id: number
      error: WatchSourceErrorSnapshot
    }
  | { type: 'watch-source-closed' }

export function snapshotWatchDirectories(
  value: WatchDirectories
): WatchDirectories {
  const cwd = process.cwd()
  return structuredClone({
    directories: value.directories.map((file) => path.resolve(cwd, file)),
    outputDirectories: value.outputDirectories.map((file) =>
      path.resolve(cwd, file)
    ),
    ...(value.outputFiles
      ? {
          outputFiles: value.outputFiles.map((file) => path.resolve(cwd, file)),
        }
      : {}),
    ...(value.dependencyFiles
      ? {
          dependencyFiles: value.dependencyFiles.map((file) =>
            path.resolve(cwd, file)
          ),
        }
      : {}),
    ...(value.artifactDirectories
      ? {
          artifactDirectories: value.artifactDirectories.map((entry) => ({
            parentDirectory: path.resolve(cwd, entry.parentDirectory),
            basenamePrefixes: [...entry.basenamePrefixes],
          })),
        }
      : {}),
  })
}
