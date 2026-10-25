import type { ReporterTaskSnapshot } from '../reporting/live-tasks'
import type { RunnerCaseResult, RunnerSuiteResult } from '../runner/lifecycle'
import type { FakeTimerOptions } from '../assertions/utilities'
import type { ClientDeclaration } from './collection'
import type { TestArtifact } from '../runner/tasks'
import type { RuntimeModuleCompletion } from '../execution/completed-module'
import type {
  SnapshotUpdate,
  SnapshotUpdateMode,
} from '../assertions/snapshots'

/** Reserved same-console-stream boundaries for formatted-output deduplication. */
export const clientConsoleBoundary = {
  start: '__NEXT_TEST_CONSOLE_START__',
  stop: '__NEXT_TEST_CONSOLE_STOP__',
  escape: '__NEXT_TEST_CONSOLE_ESCAPE__',
} as const

export interface ClientIdentity {
  version: 1
  runId: string
  entryId: string
  revision: string
  /** Immutable opaque owner, allocated before this page is navigated. */
  ownerToken: string
}
export type ClientSnapshotMethod =
  | 'resolvePath'
  | 'resolveRawPath'
  | 'readSnapshotFile'
export interface ClientConfiguration extends ClientIdentity {
  authorization: string
  rpcURL: string
  filePath: string
  projectName?: string
  sourceHash: string
  projectDir: string
  snapshotUpdateMode: SnapshotUpdateMode
  testNamePattern?: { source: string; flags: string }
  allowOnly?: boolean
  captureTaskResults?: boolean
  includeTaskLocation?: boolean
  captureCompletedModuleResult?: true
  /** Private scheduling control, independent of the test file's lifetime. */
  userCancellation?: true
  testTimeout: number
  hookTimeout: number
  hookSequence?: 'stack' | 'list' | 'parallel'
  maxConcurrency?: 1
  retry?: number
  fakeTimers?: FakeTimerOptions
  provide?: Record<string, unknown>
  env?: Record<string, string>
  globals?: boolean
  clearMocks?: boolean
  mockReset?: boolean
  restoreMocks?: boolean
  unstubGlobals?: boolean
  unstubEnvs?: boolean
  /** Compiler-issued maps containing the selected source, ready before execution. */
  sourceMaps: { url: string; map: unknown; originalSources: string[] }[]
}
export interface ClientBrowserCommand {
  element: string
  method:
    | 'type'
    | 'keyboard'
    | 'keyboardCleanup'
    | 'wheel'
    | 'tab'
    | 'dragAndDrop'
    | 'click'
    | 'dblClick'
    | 'tripleClick'
    | 'unhover'
    | 'hover'
    | 'fill'
    | 'clear'
    | 'selectOptions'
    | 'upload'
  args: unknown[]
}
export type ClientMessage = ClientIdentity & { sequence: number } & (
    | {
        type: 'output'
        stream: 'stdout' | 'stderr'
        text: string
        time?: number
        console?: Extract<
          import('../reporting/events').ResultEvent,
          { type: 'output' }
        >['console']
      }
    | {
        type: 'snapshot'
        method: ClientSnapshotMethod
        args: readonly string[]
      }
    | {
        type: 'collected'
        declarations: ClientDeclaration[]
        taskTree?: ReporterTaskSnapshot
      }
    | {
        type: 'case-start'
        context: {
          id: string
          fileId: string
          testId: string
          name: string
          retry: number
          repeat: number
        }
      }
    | { type: 'browser-command'; command: ClientBrowserCommand }
    | {
        type: 'artifact'
        taskId: string
        attempt?: { id: string; retry: number; repeat: number }
        artifact: TestArtifact
      }
    | { type: 'case-end'; result: RunnerCaseResult }
    | {
        type: 'task-update'
        caseResults: RunnerCaseResult[]
        taskTree: ReporterTaskSnapshot
        taskUpdateIds: string[]
      }
    | {
        type: 'suite-end'
        result: RunnerSuiteResult
      }
    | { type: 'failure'; error: unknown }
    | {
        type: 'complete'
        moduleCompletion?: RuntimeModuleCompletion
        status: 'passed' | 'failed'
        interrupted: boolean
        caseCount: number
        updates: SnapshotUpdate[]
        snapshotSummary?: unknown
      }
  )

type WithoutIdentity<T> = T extends unknown
  ? Omit<T, keyof ClientIdentity | 'sequence'>
  : never
export type ClientPayload = WithoutIdentity<ClientMessage>

export function assertClientIdentity(
  value: Record<string, unknown>,
  expected: ClientIdentity
): void {
  for (const key of [
    'version',
    'runId',
    'entryId',
    'revision',
    'ownerToken',
  ] as const)
    if (value[key] !== expected[key])
      throw new Error('Browser Mode transport identity mismatch.')
}
