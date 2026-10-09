import type {
  CompiledTestArtifact,
  ExecuteTestOptions,
  TestCoverageCompletion,
} from '../contracts'
import type { ResultEvent } from '../reporting/events'

/** Validate opt-in before forking, without evaluating any artifact code. */
export function assertCoverageRequest(
  artifact: CompiledTestArtifact,
  options: Pick<ExecuteTestOptions, 'coverage' | 'onCoverage'>
): void {
  if (!options.coverage) {
    if (options.onCoverage)
      throw new Error('Coverage callback requires a request')
    return
  }
  if (
    options.coverage.version !== 1 ||
    options.coverage.kind !== 'node-line' ||
    artifact.kind !== 'node' ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.mode !== 'development' ||
    artifact.profile.route !== undefined ||
    artifact.moduleMocking
  ) {
    throw new Error('Coverage requires an unmocked development Node profile')
  }
  if (!artifact.coverage)
    throw new Error('Compiled artifact lacks coverage metadata')
  if (typeof options.onCoverage !== 'function') {
    throw new Error('Coverage requires an awaited parent consumer')
  }
}

/** Every started retry must finish; skipped/unstarted cases need no interval. */
export function createCoverageAttemptTracker() {
  const started = new Map<string, string>()
  const ended = new Set<string>()
  let invalid = false
  return {
    observe(event: ResultEvent) {
      if (
        event.type === 'diagnostic' &&
        event.diagnostic.severity === 'error'
      ) {
        invalid = true
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
    get complete() {
      return !invalid && [...started.keys()].every((id) => ended.has(id))
    },
  }
}

export function assertCoverageCompletion(
  value: unknown,
  artifact: CompiledTestArtifact,
  runId: string
): asserts value is TestCoverageCompletion {
  if (!value || typeof value !== 'object') {
    throw new Error('Missing test worker coverage completion')
  }
  const completion = value as TestCoverageCompletion
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
