/** An actual non-run selection whose finalized public declaration remains run. */
interface UnexecutedCaseShape {
  unexecuted?: unknown
  entryId?: unknown
  caseId?: unknown
  attempt?: { id?: unknown; retry?: unknown; repeat?: unknown }
  mode?: unknown
  status?: unknown
  pending?: unknown
  bail?: unknown
  note?: unknown
  durationMs?: unknown
  errors?: unknown
}

/** Absence retains the old result contract; a present fact must be exact. */
export function assertUnexecutedCaseResult(
  result: UnexecutedCaseShape
): boolean {
  if (result.unexecuted === undefined) return false
  if (
    result.unexecuted !== true ||
    typeof result.entryId !== 'string' ||
    typeof result.caseId !== 'string' ||
    typeof result.attempt?.id !== 'string' ||
    result.attempt.retry !== 0 ||
    result.attempt.repeat !== 0 ||
    result.mode !== 'run' ||
    result.status !== 'skipped' ||
    result.pending !== undefined ||
    result.bail !== undefined ||
    result.note !== undefined ||
    result.durationMs !== 0 ||
    !Array.isArray(result.errors) ||
    result.errors.length !== 0
  )
    throw new Error('Invalid actual unexecuted case result.')
  return true
}
