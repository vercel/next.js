import type {
  serializeTaskError,
  File,
  Test,
  Suite,
  Task,
  TaskMeta,
  TestAnnotation,
  TestArtifactLocation,
  TestArtifact,
} from './tasks'
import type { TestExpect } from '../assertions'
import type { TestSequenceOptions } from './sequence'
import type {
  Cleanup,
  TestBody,
  TestContext,
  InternalTestContext,
  TestOptions,
} from './collector'

export interface AttemptContext extends InternalTestContext {
  readonly id: string
  readonly fileId: string
  readonly testId: string
  /** Full ancestor-qualified test name, used by snapshots. */
  readonly name: string
  readonly testName?: string
  readonly ancestors?: { id: string; name: string }[]
  readonly mode?: 'run' | 'skip' | 'todo'
  readonly retry: number
  readonly repeat: number
  onAssertionFailure?(error: unknown): void
  onCleanup(cleanup: Cleanup): void
}

export interface AttemptIntegration {
  readonly expect?: TestExpect
  beforeTry?(): void
  awaitBodyAssertions?<T>(invoke: () => Promise<T>): Promise<T>
  consumePublicTaskPromises?<T>(value: T): T | Promise<T>
  suspend?<T>(runInner: () => Promise<T>): Promise<T>
  finishTest?(failed: boolean): Promise<void>
  consumeBodyAssertionFailure?(error: unknown): boolean
  invokeFinishedCallback?(fn: TestBody, context: TestContext): Promise<unknown>
  markSkipped?(): unknown[]
  checkpoint?(): Promise<void>
  /** Only the actual assertion-runtime afterAll finalizer can issue this fact. */
  isSettledCoverageFinalizationFailure?(error: unknown): boolean
  finalize(): Promise<void>
  dispose(): Promise<void>
}

export interface SuiteHookContext {
  readonly id: string
  readonly fileId: string
  readonly suiteId: string
  readonly name: string
  readonly hook: 'beforeAll' | 'afterAll' | 'aroundAll' | 'cleanup'
  readonly signal: AbortSignal
}

export interface SuiteHookLifecycle {
  beginFileFixtures?(context: {
    readonly id: string
    readonly name: string
  }): AttemptIntegration | Promise<AttemptIntegration>
  beginHook(
    context: SuiteHookContext
  ): AttemptIntegration | Promise<AttemptIntegration>
  setActiveHook(context: SuiteHookContext | undefined): void
}

export interface RunnerFailure {
  /** Private execution-realm carrier; consumed before diagnostic IPC. */
  readonly registrationError?: Error
  /** Private attempt-owned assertion fact, consumed before returning the result. */
  readonly snapshotBodyAssertion?: string
  phase:
    | 'beforeAll'
    | 'afterAll'
    | 'beforeEach'
    | 'afterEach'
    | 'aroundEach'
    | 'aroundAll'
    | 'test'
    | 'cleanup'
    | 'assertion'
    | 'runtime'
  error: unknown
}

export interface RunnerCaseResult {
  location?: TestArtifactLocation
  entryId: string
  caseId: string
  attempt: { id: string; retry: number; repeat: number }
  name: string
  testName?: string
  ancestors?: { id: string; name: string }[]
  mode?: 'run' | 'skip' | 'todo'
  pending?: boolean
  /** Actual excluded execution with an untouched run-mode public declaration. */
  unexecuted?: true
  bail?: boolean
  note?: string
  status: 'passed' | 'failed' | 'skipped' | 'cancelled'
  durationMs: number
  errors: RunnerFailure[]
  meta?: TaskMeta
  tags?: string[]
  annotations?: TestAnnotation[]
}

export interface RunnerSuiteResult {
  entryId: string
  suiteId: string
  name: string
  ancestors: { id: string; name: string }[]
  mode: 'run' | 'skip' | 'todo'
  status: 'passed' | 'failed' | 'skipped' | 'cancelled'
  durationMs: number
  /** This suite failed setup before entering any descendant. */
  blockedDescendants?: boolean
  errors: RunnerFailure[]
}

export interface RunnerResult {
  cases: RunnerCaseResult[]
  errors: RunnerFailure[]
  /** Unrecovered execution deadlines or cancellation veto publication. */
  interrupted: boolean
}

export type PublishedModuleState = 'pass' | 'fail' | 'skip' | 'todo'

export interface RunnerModuleResultObservation {
  finalState?: PublishedModuleState
}

/** Actual fulfilled module execution, before independent host disposal. */
export interface CompletedModuleResult {
  readonly version: 2
  readonly durationMs: number
  readonly containsOnly: boolean
  readonly interrupted: boolean
  /** null means the actual root publication was unavailable. */
  readonly finalState: PublishedModuleState | null
}

export interface RunnerSuiteTaskErrorOrigins {
  readonly result: NonNullable<Suite['result']>
  readonly errors: NonNullable<NonNullable<Suite['result']>['errors']>
  readonly origins: readonly {
    readonly index: number
    readonly serializedError: ReturnType<typeof serializeTaskError>
    readonly registrationError: Error
  }[]
}

export interface RunnerOptions {
  /** Public finalized skip/todo modes; private standalone selection is unchanged. */
  finalizePublicTaskModes?: true
  /** Actual readonly File owns resolved public selection, including allowed focus. */
  finalizeFocusedPublicTaskModes?: true
  /** The actual assertion snapshot owner, before any file resources execute. */
  prepareSnapshots?(file: File): void | Promise<void>
  /** Actual empty public File failure, before authored file resources or hooks. */
  prepareEmptyPublicFile?: true
  /** Internal scheduling hint capture; never publication or baseline authority. */
  captureCompletedModuleResult?: true
  /** Private Istanbul completion observation; independent of snapshot eligibility. */
  captureCoverageCompletion?: true
  retry?: TestOptions['retry']
  bail?: number
  passWithNoTests?: boolean
  allowOnly?: boolean
  filePath?: string
  inject?: TestContext['inject']
  projectName?: string
  projectDir?: string
  attachmentsDir?: string
  getAnnotationLocation?(error: Error): TestArtifactLocation | undefined
  getArtifactLocation?(error: Error): TestArtifactLocation | undefined
  captureTestRecords?: true
  /** Private attempt-owned resources retain their original context guards. */
  resourceLifetime?: 'attempt' | 'file'
  onAnnotation?(
    context: AttemptContext,
    annotation: TestAnnotation
  ): TestAnnotation | void | Promise<TestAnnotation | void>
  onTestRecordArtifact?(
    context: AttemptContext,
    artifact: TestArtifact
  ): Promise<TestArtifact>
  onArtifact?(
    context: AttemptContext,
    artifact: TestArtifact
  ): void | Promise<void>
  onBrowserArtifact?(
    task: Task,
    artifact: TestArtifact,
    context?: AttemptContext
  ): Promise<TestArtifact>
  runId: string
  signal: AbortSignal
  /** Scheduling only: skip active/queued bodies while actual cleanup still runs. */
  userCancelSignal?: AbortSignal
  testTimeout?: number
  hookTimeout?: number
  testNamePattern?: string | RegExp
  maxConcurrency?: number
  sequence?: TestSequenceOptions
  runWithCasePhase?<T>(
    phase: RunnerFailure['phase'],
    fn: () => T,
    authoredCallback?: boolean
  ): T
  beginAttempt?(
    context: AttemptContext
  ): AttemptIntegration | Promise<AttemptIntegration>
  /** Public selectors follow logical tasks, independently of private async owners. */
  setCurrentTest?(task: Test | undefined): void
  setCurrentTask?(task: Task): void
  onLateFailure?(error: Error): void
  onUnhandledFailure?(reason: unknown): void
  /** Requested actual root preparation; never an authored reporter acknowledgement. */
  captureModuleStart?: true
  /** Actual isolated host requests per-occurrence registration capture. */
  captureSuiteErrorOrigins?: true
  onFilePrepared?(file: File): void
  /** Actual task graph, before authored fixtures, hooks or bodies start. */
  onCollected?(file: File): void | Promise<void>
  /** Actual rejected collection notification; synchronous callback throws stay fatal. */
  onCollectedError?(
    file: File,
    operation: Promise<void>,
    error: unknown
  ): void | Promise<void>
  onCaseStart?(context: AttemptContext): void | Promise<void>
  onCaseEnd?(result: RunnerCaseResult): void | Promise<void>
  /** Once per prepared logical task, before attempt fixtures, repeats and retries. */
  onCaseReady?(task: Test): void
  /** Actual traditional hook-group boundaries; absent in legacy producers. */
  onReporterHookOccurrence?(
    task: Test | Suite,
    hook: 'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach',
    event: 'hook-start' | 'hook-end'
  ): void
  /** Actual non-file suite preparation, before its owned hooks. */
  onSuiteReady?(task: Suite): void
  /** Once per logical case, after retries, repeats and owned attempt closure. */
  onCaseResult?(task: Test, result: RunnerCaseResult): void | Promise<void>
  onSuiteEnd?(
    result: RunnerSuiteResult,
    task: Suite,
    origins?: RunnerSuiteTaskErrorOrigins
  ): void | Promise<void>
}

export interface RunnerOperationObservation {
  readonly bounded: Set<TimedOperation>
  readonly around: Set<TimedOperation>
  /** Actual beforeAll expansion returned an uncreated carrier; never reset. */
  beforeAllCaptureIncomplete?: true
  pendingHooks?: ReadonlySet<Promise<unknown>>
}

export interface OperationSettlement {
  readonly version: 1
  readonly bounded: { readonly observed: number; readonly pending: number }
  readonly around: { readonly observed: number; readonly pending: number }
  readonly pendingHooks: number
}

interface TimedOperation {
  settled: boolean
  completion?: Promise<void>
  rejection?: { error: unknown }
}
