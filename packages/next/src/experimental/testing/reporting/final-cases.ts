import type { CaseResult } from './events'

type AttemptResult = Pick<
  CaseResult,
  'caseId' | 'attempt' | 'status' | 'pending'
>

/** Final outcomes for one file: retries replace attempts; failed repeats persist. */
export function getFinalCaseResults<T extends AttemptResult>(
  results: Iterable<T>
): Map<string, T> {
  const cases = new Map<string, Map<number, T>>()
  for (const result of results) {
    let repeats = cases.get(result.caseId)
    if (!repeats) cases.set(result.caseId, (repeats = new Map()))
    const previous = repeats.get(result.attempt.repeat)
    if (!previous || previous.attempt.retry < result.attempt.retry) {
      repeats.set(result.attempt.repeat, result)
    }
  }
  const final = new Map<string, T>()
  for (const [caseId, repeats] of cases) {
    const attempts = [...repeats.values()]
    const skipped = attempts.find((result) => result.pending)
    const failed = attempts.find((result) => result.status === 'failed')
    const cancelled = attempts.find((result) => result.status === 'cancelled')
    const latest = attempts.reduce((selected, result) =>
      result.attempt.repeat > selected.attempt.repeat ? result : selected
    )
    final.set(caseId, skipped ?? failed ?? cancelled ?? latest)
  }
  return final
}
