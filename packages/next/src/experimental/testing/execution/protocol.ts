import type { CustomCoverageCompletion } from '../coverage/custom-types'
import type {
  CompiledTestArtifact,
  ExecuteTestOptions,
  TestCoverageCompletion,
  TestFileCollection,
} from '../contracts'
import type { FileResult, ResultEvent } from '../reporting/events'
import type { SnapshotUpdate } from '../assertions/snapshots'

export interface WorkerInput {
  artifact: CompiledTestArtifact
  options: Omit<
    ExecuteTestOptions,
    | 'signal'
    | 'onEvent'
    | 'onCoverage'
    | 'onCustomCoverage'
    | 'onCustomCoverageSuite'
  >
  customCoverageSuite?: true
  cacheScope: { type: 'file'; directory: string }
}

export type WorkerMessage =
  | { type: 'event'; event: ResultEvent }
  | { type: 'custom-coverage-suite'; completion: CustomCoverageCompletion }
  | {
      type: 'complete'
      result: FileResult
      snapshotUpdates?: SnapshotUpdate[]
      coverage?: TestCoverageCompletion
      customCoverage?: CustomCoverageCompletion
      collection?: TestFileCollection
    }

/** Private prerequisite for a compiler-issued shared immutable runtime cohort. */
export interface WorkerLeaseInput {
  version: 1
  leaseId: string
  runId: string
  rootDir: string
  revision: string
  profile: CompiledTestArtifact['profile']
}

export type WorkerLeaseRequest =
  | { type: 'file'; leaseId: string; requestId: number; input: WorkerInput }
  | { type: 'finish-worker'; leaseId: string; finishToken: string }

export type WorkerLeaseMessage =
  | { type: 'worker-ready'; leaseId: string }
  | {
      type: 'file-message'
      leaseId: string
      requestId: number
      message: WorkerMessage
      /** A completed file has sealed every file/attempt owner; false retires the lease. */
      reusable?: boolean
    }
  | {
      type: 'worker-complete'
      leaseId: string
      finishToken: string
      /** Attached only after shared worker disposal, before authoritative process exit. */
      snapshotUpdates?: { requestId: number; updates: SnapshotUpdate[] }[]
    }

export type WorkerFileCompletion = Extract<WorkerMessage, { type: 'complete' }>
