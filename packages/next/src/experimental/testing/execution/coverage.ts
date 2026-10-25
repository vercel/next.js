import { assertMockCoverageArtifact } from '../coverage/mock-sources'
import { assertSourceCoverageArtifact } from '../coverage/source-profile'
import type {
  CompiledTestArtifact,
  ExecuteTestOptions,
  AnyTestCoverageCompletion,
} from '../contracts'
import type { ResultEvent, SerializedDiagnostic } from '../reporting/events'
import { isDeepStrictEqual } from 'util'

/** Validate opt-in before forking, without evaluating any artifact code. */
export function assertCoverageRequest(
  artifact: CompiledTestArtifact,
  options: Pick<
    ExecuteTestOptions,
    'coverage' | 'onCoverage' | 'onIstanbulCoverage'
  >
): void {
  if (artifact.coverage?.sourceAnalysis)
    throw new Error(
      'Compile-only coverage sources cannot enter runtime capture'
    )
  if (!options.coverage) {
    if (artifact.coverage?.istanbul || artifact.coverage?.istanbulHarness)
      throw new Error(
        'Istanbul coverage metadata requires its explicit request.'
      )
    if (options.onCoverage || options.onIstanbulCoverage)
      throw new Error('Coverage callback requires a request')
    return
  }
  if (options.coverage.kind === 'node-istanbul') {
    if (
      options.coverage.version !== 1 ||
      artifact.kind !== 'node' ||
      artifact.profile.mode !== 'development' ||
      artifact.profile.environment !== 'node' ||
      artifact.profile.route !== undefined ||
      artifact.profile.browserClient !== undefined ||
      !artifact.coverage?.istanbul ||
      options.onCoverage ||
      typeof options.onIstanbulCoverage !== 'function'
    )
      throw new Error(
        'Istanbul coverage requires its matching artifact and awaited parent consumer.'
      )
    return
  }
  if (
    artifact.coverage?.istanbul ||
    artifact.coverage?.istanbulHarness ||
    options.onIstanbulCoverage
  )
    throw new Error('Istanbul coverage metadata requires its explicit request.')
  if (
    options.coverage.version !== 1 ||
    options.coverage.kind !== 'node-line' ||
    artifact.kind !== 'node' ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.route !== undefined
  ) {
    throw new Error('Coverage requires an explicit Node coverage profile')
  }
  if (artifact.profile.mode === 'production')
    assertSourceCoverageArtifact(artifact)
  else if (artifact.coverage?.sourcePreservation)
    throw new Error('Unrequested production source coverage provenance.')
  assertMockCoverageArtifact(artifact)
  if (!artifact.coverage)
    throw new Error('Compiled artifact lacks coverage metadata')
  if (typeof options.onCoverage !== 'function') {
    throw new Error('Coverage requires an awaited parent consumer')
  }
}

/** Every started retry must finish; skipped/unstarted cases need no interval. */
export function createCoverageAttemptTracker(
  options: {
    deferNativeRejections?: boolean
    deferSettledSuiteErrors?: boolean
    deferSettledFileErrors?: boolean
    fileErrorOwner?: { runId: string; entryId: string; revision: string }
  } = {}
) {
  const started = new Map<string, string>()
  if (options.deferSettledFileErrors && !options.fileErrorOwner)
    throw new Error('File coverage slots require their actual execution owner.')
  const ended = new Set<string>()
  let invalid = false
  let pendingNativeRejections = false
  let receivedCompletion = false
  const pendingSuiteErrors = new Set<string>()
  let authorizedSuiteErrors = false
  const pendingFileErrors = new Map<number, SerializedDiagnostic>()
  let authorizedFileErrors = false
  return {
    observe(event: ResultEvent) {
      if (
        event.type === 'diagnostic' &&
        (event.diagnostic.severity === 'error' ||
          (options.deferNativeRejections && receivedCompletion))
      ) {
        if (
          options.deferNativeRejections &&
          !receivedCompletion &&
          event.diagnostic.phase === 'runtime' &&
          event.diagnostic.unhandled === 'rejection'
        )
          pendingNativeRejections = true
        else if (
          options.deferSettledSuiteErrors &&
          !receivedCompletion &&
          event.diagnostic.phase === 'runtime' &&
          event.diagnostic.unhandled === undefined &&
          event.suiteError &&
          typeof event.suiteError.suiteId === 'string' &&
          event.suiteError.suiteId.length > 0 &&
          Number.isSafeInteger(event.suiteError.index) &&
          event.suiteError.index >= 0
        ) {
          const key = JSON.stringify([
            event.suiteError.suiteId,
            event.suiteError.index,
          ])
          if (pendingSuiteErrors.has(key)) invalid = true
          pendingSuiteErrors.add(key)
        } else if (
          options.deferSettledFileErrors &&
          !receivedCompletion &&
          event.diagnostic.phase === 'cleanup' &&
          event.diagnostic.unhandled === undefined &&
          event.coverageFileError &&
          Object.keys(event.coverageFileError).every(
            (key) => key === 'index'
          ) &&
          Number.isSafeInteger(event.coverageFileError.index) &&
          event.coverageFileError.index >= 0 &&
          event.runId === options.fileErrorOwner!.runId &&
          event.entryId === options.fileErrorOwner!.entryId &&
          event.revision === options.fileErrorOwner!.revision
        ) {
          const index = event.coverageFileError.index
          if (pendingFileErrors.has(index)) invalid = true
          pendingFileErrors.set(index, structuredClone(event.diagnostic))
        } else invalid = true
      }
      if (event.type !== 'case-start' && event.type !== 'case-end') return
      const { id, retry, repeat } = event.attempt
      if (
        !id ||
        !Number.isInteger(retry) ||
        retry < 0 ||
        !Number.isInteger(repeat) ||
        repeat < 0
      )
        throw new Error('Invalid coverage attempt identity')
      const identity = JSON.stringify([event.caseId, retry, repeat])
      if (event.type === 'case-start') {
        if (started.has(id) || ended.has(id)) {
          throw new Error('Duplicate coverage attempt start')
        }
        started.set(id, identity)
      } else {
        if (ended.has(id))
          throw new Error('Duplicate coverage attempt completion')
        ended.add(id)
        if (!started.has(id) && event.status === 'passed') {
          throw new Error('Coverage attempt completed without a start')
        }
        if (started.has(id) && started.get(id) !== identity) {
          throw new Error('Mismatched coverage attempt completion')
        }
        if (event.status === 'cancelled') invalid = true
        if (event.errors.some((error) => error.phase === 'cleanup'))
          invalid = true
      }
    },
    observeCoverageCompletion(complete: boolean) {
      receivedCompletion = true
      if (complete) pendingNativeRejections = false
      else invalid = true
    },
    /** Called only after the actual worker/process/cache owner has joined. */
    authorizeSettledSuiteErrors(value: unknown) {
      if (
        !options.deferSettledSuiteErrors ||
        !receivedCompletion ||
        authorizedSuiteErrors
      )
        throw new Error(
          'Unrequested or repeated settled suite-error observation.'
        )
      authorizedSuiteErrors = true
      const references = value === undefined ? [] : value
      if (!Array.isArray(references))
        throw new Error('Invalid settled suite-error references.')
      const observed = new Set<string>()
      for (const reference of references) {
        if (
          !reference ||
          typeof reference.suiteId !== 'string' ||
          !reference.suiteId ||
          !Number.isSafeInteger(reference.index) ||
          reference.index < 0
        )
          throw new Error('Invalid settled suite-error reference.')
        const key = JSON.stringify([reference.suiteId, reference.index])
        if (observed.has(key) || !pendingSuiteErrors.has(key))
          throw new Error(
            'Duplicate or unsolicited settled suite-error reference.'
          )
        observed.add(key)
      }
      if (observed.size !== pendingSuiteErrors.size)
        throw new Error('Missing settled suite-error reference.')
      pendingSuiteErrors.clear()
    },
    /** Actual file/process/cache joins precede this exact diagnostic agreement. */
    authorizeSettledFileErrors(value: unknown) {
      if (
        !options.deferSettledFileErrors ||
        !receivedCompletion ||
        authorizedFileErrors
      )
        throw new Error(
          'Unrequested or repeated settled file-error observation.'
        )
      authorizedFileErrors = true
      const references = value === undefined ? [] : value
      if (!Array.isArray(references))
        throw new Error('Invalid settled file-error references.')
      const observed = new Set<number>()
      for (const reference of references) {
        if (
          !reference ||
          !Number.isSafeInteger(reference.index) ||
          reference.index < 0 ||
          Object.keys(reference).some(
            (key) => key !== 'index' && key !== 'diagnostic'
          )
        )
          throw new Error('Invalid settled file-error reference.')
        if (
          observed.has(reference.index) ||
          !pendingFileErrors.has(reference.index) ||
          !isDeepStrictEqual(
            structuredClone(reference.diagnostic),
            pendingFileErrors.get(reference.index)
          )
        )
          throw new Error(
            'Duplicate, unsolicited or mismatched settled file-error reference.'
          )
        observed.add(reference.index)
      }
      if (observed.size !== pendingFileErrors.size)
        throw new Error('Missing settled file-error reference.')
      pendingFileErrors.clear()
    },
    get complete() {
      return (
        !invalid &&
        !pendingNativeRejections &&
        pendingSuiteErrors.size === 0 &&
        pendingFileErrors.size === 0 &&
        [...started.keys()].every((id) => ended.has(id))
      )
    },
  }
}

export function assertCoverageCompletion(
  value: unknown,
  artifact: CompiledTestArtifact,
  runId: string
): asserts value is AnyTestCoverageCompletion {
  if (artifact.coverage?.sourceAnalysis)
    throw new Error(
      'Compile-only coverage sources cannot enter runtime capture'
    )
  if (!value || typeof value !== 'object') {
    throw new Error('Missing test worker coverage completion')
  }
  const completion = value as AnyTestCoverageCompletion
  if (
    ('settledSuiteErrors' in completion || 'settledFileErrors' in completion) &&
    (!artifact.coverage?.istanbul || completion.complete !== true)
  )
    throw new Error('Unrequested settled suite-error observation.')
  if (
    completion.version !== 1 ||
    completion.runId !== runId ||
    completion.entryId !== artifact.entryId ||
    completion.revision !== artifact.revision
  )
    throw new Error('Mismatched test worker coverage completion')
  if (completion.complete === true) {
    if (
      !completion.data ||
      typeof completion.data !== 'object' ||
      'error' in completion
    ) {
      throw new Error('Invalid test worker coverage capture')
    }
  } else if (completion.complete === false) {
    if (
      !completion.error ||
      typeof completion.error.message !== 'string' ||
      'data' in completion
    ) {
      throw new Error('Invalid incomplete test worker coverage completion')
    }
  } else throw new Error('Invalid test worker coverage completeness')
}
