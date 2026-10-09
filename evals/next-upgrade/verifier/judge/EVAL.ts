// A semantic FAIL is valid only after the native judge completed and returned
// a structured verdict. Runner/parser failures must never qualify a negative.
export function completedJudge(
  runner: { ok: boolean; agentExitCode: number | null },
  raw: string | null | undefined
): { pass: boolean; reason: string } {
  if (!runner.ok || runner.agentExitCode !== 0) {
    throw new Error('Fixed judge did not complete with a structured verdict')
  }
  // Preserve native prose/fence tolerance, but validate before its parser can
  // coerce a string such as "false" into a successful boolean verdict.
  const match = raw?.match(/\{[\s\S]*"pass"[\s\S]*\}/)
  if (!match) {
    throw new Error('Fixed judge did not return a structured verdict')
  }
  const verdict = JSON.parse(match[0])
  if (typeof verdict.pass !== 'boolean' || typeof verdict.reason !== 'string') {
    throw new Error('Fixed judge returned a malformed verdict')
  }
  return { pass: verdict.pass, reason: verdict.reason }
}
