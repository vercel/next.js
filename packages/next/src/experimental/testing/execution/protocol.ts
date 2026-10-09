import type {
  CompiledTestArtifact,
  ExecuteTestOptions,
  TestCoverageCompletion,
} from '../contracts'
import type { FileResult, ResultEvent } from '../reporting/events'
import type { SnapshotUpdate } from '../assertions/snapshots'

export interface WorkerInput {
  artifact: CompiledTestArtifact
  options: Omit<ExecuteTestOptions, 'signal' | 'onEvent' | 'onCoverage'>
  cacheScope: { type: 'file'; directory: string }
}

export type WorkerMessage =
  | { type: 'event'; event: ResultEvent }
  | {
      type: 'complete'
      result: FileResult
      snapshotUpdates?: SnapshotUpdate[]
      coverage?: TestCoverageCompletion
    }
