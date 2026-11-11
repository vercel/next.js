import type { SnapshotPreparationFailure } from './snapshot-preparation'
import type { CustomCoverageCompletion } from '../coverage/custom-types'
import type {
  CompiledTestArtifact,
  ExecuteTestOptions,
  AnyTestCoverageCompletion,
  TestFileCollection,
  TestRecordEvent,
} from '../contracts'
import type { ReporterTestRecordOutcome } from '../reporting/test-records'
import type { FileResult, ResultEvent } from '../reporting/events'
import type { SnapshotUpdate } from '../assertions/snapshots'
import type { RuntimeModuleCompletion } from './completed-module'

export interface WorkerInput {
  artifact: CompiledTestArtifact
  options: Omit<
    ExecuteTestOptions,
    | 'signal'
    | 'userCancelSignal'
    | 'onEvent'
    | 'onTestRecord'
    | 'onConsoleDrain'
    | 'onCoverage'
    | 'onIstanbulCoverage'
    | 'onCustomCoverage'
    | 'onCustomCoverageSuite'
    | 'onSnapshotPreparationFailure'
  >
  customCoverageSuite?: true
  /** Issued only by the parent which owns the separate scheduling signal. */
  userCancellation?: true
  cacheScope: { type: 'file'; directory: string }
}

export interface TestRecordRequest {
  type: 'test-record'
  requestId: number
  event: TestRecordEvent
}

export interface TestRecordResponse {
  type: 'test-recorded'
  requestId: number
  runId: string
  entryId: string
  revision: string
  outcome: ReporterTestRecordOutcome
}

export type WorkerMessage =
  | TestRecordRequest
  | {
      type: 'snapshot-preparation-failure'
      failure: SnapshotPreparationFailure
    }
  | { type: 'event'; event: ResultEvent }
  | {
      type: 'console-drain'
      runId: string
      entryId: string
      revision: string
    }
  | {
      type: 'user-cancellation-finalized'
      version: 1
      runId: string
      entryId: string
      revision: string
    }
  | {
      type: 'task-updates-drain'
      runId: string
      entryId: string
      revision: string
    }
  | { type: 'custom-coverage-suite'; completion: CustomCoverageCompletion }
  | {
      type: 'complete'
      result: FileResult
      moduleCompletion?: RuntimeModuleCompletion
      /** Actual host cleanup outcome; present only with private capture. */
      moduleHostCleanupComplete?: boolean
      snapshotUpdates?: SnapshotUpdate[]
      coverage?: AnyTestCoverageCompletion
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
