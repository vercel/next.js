import type { TestEntry } from '../contracts'

/** Source coordinates are one-based; omitted coordinates are unknown. */
export interface SourceLocation {
  file: string
  line?: number
  column?: number
}

export interface SerializedDiagnostic {
  phase:
    | 'configuration'
    | 'compilation'
    | 'collection'
    | 'runtime'
    | 'cleanup'
    | 'reporter'
  severity: 'error' | 'warning'
  message: string
  name?: string
  stack?: string
  /** Producer-formatted assertion difference, when available. */
  diff?: string
  location?: SourceLocation
  frames?: (SourceLocation & {
    methodName?: string
    original?: boolean
    /** Source-map ignore-list evidence, retained even when hidden in the CLI. */
    ignored?: boolean
    /** Producer excerpt from the exact revision's original sourcesContent. */
    codeFrame?: string
  })[]
  cause?: SerializedDiagnostic
  /** Individual errors from an AggregateError, in producer order. */
  errors?: SerializedDiagnostic[]
}

export interface AttemptIdentity {
  id: string
  /** Zero-based retry and repeat indices. */
  retry: number
  repeat: number
}

export type ResultStatus = 'passed' | 'failed' | 'skipped' | 'cancelled'

export interface ResultScope {
  entryId: string
  caseId?: string
  attempt?: AttemptIdentity
  revision?: string
}

export interface TestAttachment {
  name: string
  kind: 'trace' | 'screenshot' | 'video' | 'file'
  /** Absolute path owned by the producer; reporters must not delete it. */
  path: string
  contentType: string
}

export interface CaseResult extends ResultScope {
  caseId: string
  attempt: AttemptIdentity
  name: string
  /** Structural display metadata; never split the full name on a separator. */
  testName?: string
  ancestors?: { id: string; name: string }[]
  mode?: 'run' | 'skip' | 'todo'
  location?: SourceLocation
  status: ResultStatus
  durationMs: number
  errors: SerializedDiagnostic[]
}

export interface FileResult {
  entryId: string
  status: ResultStatus
  durationMs: number
}

type EventPayload =
  | { type: 'run-start' }
  | { type: 'file-start'; entry: TestEntry; revision?: string }
  | ({ type: 'case-start' } & Pick<
      CaseResult,
      | 'entryId'
      | 'caseId'
      | 'attempt'
      | 'name'
      | 'testName'
      | 'ancestors'
      | 'mode'
      | 'location'
      | 'revision'
    >)
  | ({ type: 'case-end' } & CaseResult)
  | ({ type: 'file-end' } & FileResult)
  | ({
      type: 'diagnostic'
      diagnostic: SerializedDiagnostic
    } & Partial<ResultScope>)
  | ({
      type: 'output'
      stream: 'stdout' | 'stderr'
      text: string
    } & Partial<ResultScope>)
  | ({ type: 'attachment'; attachment: TestAttachment } & Partial<ResultScope>)
  | {
      type: 'run-end'
      status: Exclude<ResultStatus, 'skipped'>
      durationMs: number
    }

export type ResultEvent = EventPayload & {
  version: 1
  runId: string
  timestamp: number
}

export interface ResultCounts {
  passed: number
  failed: number
  skipped: number
  cancelled: number
}

export interface RunSummary {
  runId: string
  status: 'running' | Exclude<ResultStatus, 'skipped'>
  files: ResultCounts
  /** One final result per entry/case. Earlier retries and repeats remain in the event log. */
  cases: ResultCounts
  attempts: ResultCounts
  errors: number
  warnings: number
  attachments: number
}
