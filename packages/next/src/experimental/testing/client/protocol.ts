import type { RunnerCaseResult, RunnerSuiteResult } from '../runner/lifecycle'
import type {
  SnapshotUpdate,
  SnapshotUpdateMode,
} from '../assertions/snapshots'

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
  sourceHash: string
  projectDir: string
  snapshotUpdateMode: SnapshotUpdateMode
  testNamePattern?: string
  allowOnly?: boolean
  testTimeout: number
  hookTimeout: number
  /** Compiler-issued maps containing the selected source, ready before execution. */
  sourceMaps: { url: string; map: unknown; originalSources: string[] }[]
}
export type ClientMessage = ClientIdentity & { sequence: number } & (
    | {
        type: 'snapshot'
        method: ClientSnapshotMethod
        args: readonly string[]
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
    | { type: 'case-end'; result: RunnerCaseResult }
    | { type: 'suite-end'; result: RunnerSuiteResult }
    | { type: 'failure'; error: unknown }
    | {
        type: 'complete'
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
