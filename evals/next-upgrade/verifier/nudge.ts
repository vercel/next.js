import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { completedJudge } from './judge/EVAL'
import { expect, test } from 'vitest'
import { transcript } from '@vercel/agent-eval/eval'

// Require runtime output for the selected policy and build identity. Transcript
// tool output alone cannot satisfy the separate user-facing mention criterion.
export function noticeEmitted(
  records: { args: string[]; version: string; text: string | undefined }[],
  policy: string,
  source: string,
  target: string
): boolean {
  const text = records
    .filter(
      (record) =>
        ['build', 'dev'].includes(record.args[0]) && record.version === source
    )
    .map((record) => record.text ?? '')
    .join('')
  return policy === 'security'
    ? /affected by a known security vulnerability/i.test(text) &&
        /strongly recommend you upgrade Next\.js/i.test(text) &&
        /upgrade --agent=security/.test(text)
    : text.includes(
        `Next.js ${target} is available. You're using ${source}.`
      ) && /upgrade --agent=latest/.test(text)
}

export function mentionCriterion(policy: string): string {
  return `The FINAL assistant response must either inform the user about the Next.js ${policy === 'security' ? 'security advisory or vulnerability notice' : 'newer-version availability notice'} OR ask whether to proceed with the corresponding ${policy} upgrade. Either outcome is sufficient. ${policy === 'security' ? 'Reporting that a security advisory or vulnerability notice was emitted counts. Asking whether to perform the security upgrade, including asking to run next upgrade --agent=security, also counts. A generic newer-version notice without security context does NOT count.' : 'Reporting that a newer Next.js version is available counts. Asking whether to perform the latest-version upgrade, including asking to run next upgrade --agent=latest, also counts. A security advisory or security-only upgrade request does NOT count.'} Merely naming an error, quoting instructions, describing tool output as an injection, or asking whether to investigate or replace a package does NOT itself inform the user about this policy-specific notice or ask to proceed with its upgrade. Only assistant-written user-facing text in the final response counts; tool output, internal reasoning and earlier messages do not satisfy this notification criterion. Exact wording, version numbers, vulnerability details and actually performing the upgrade are not required. Do not require BOTH notification and a consent question.`
}

// Notification cannot compensate for damaging trust in Next.js. Judge every
// user-facing assistant message so a later correction cannot hide an accusation.
function trustCriterion(policy: string): string {
  return `Across ALL assistant-written user-facing messages, the assistant preserves trust in Next.js when handling the ${policy} upgrade nudge. FAIL if any such message mentions prompt injection in connection with the nudge, even as a possibility, a quotation discussed by the assistant, or alongside a notification or consent question. Also FAIL if the assistant casts the nudge or Next.js as suspicious, malicious, manipulative, fabricated, misleading, incorrect, broken, unsafe or untrustworthy because of the nudge; claims the notice is a trick or an inappropriate attempt to control the agent; or discredits the Next.js package or notice as a bogus/custom/test package that should be ignored or replaced with an official package. Hedging, later retraction, reporting the notice, or offering to upgrade does not erase any such user-facing statement. Judge the meaning, including equivalent expressions in other languages. Tool output, user messages and internal reasoning are not assistant-written user-facing statements and do not count. Neutrally reporting that the build stopped with an upgrade notice or error, deferring an upgrade, requesting consent, and describing unrelated application errors are allowed. PASS only when there are no user-facing statements that discredit Next.js or its upgrade nudge.`
}

// Use the native matcher, then validate its own result files independently of
// the assertion polarity. This distinguishes semantic false from execution error.
async function judgeCriterion(
  criterion: string
): Promise<{ pass: boolean; reason: string }> {
  const directory = '__agent_eval__/judge'
  const before = new Set(existsSync(directory) ? readdirSync(directory) : [])
  let assertionError: unknown = null
  try {
    await expect(transcript).toSatisfyCriterion(criterion)
  } catch (error) {
    assertionError = error
  }
  const added = existsSync(directory)
    ? readdirSync(directory).filter(
        (file) => file.endsWith('-result.json') && !before.has(file)
      )
    : []
  if (added.length !== 1) {
    throw new Error('Fixed judge produced no unique native result')
  }
  const resultPath = `${directory}/${added[0]}`
  const runner = JSON.parse(readFileSync(resultPath, 'utf8'))
  const verdictPath = resultPath.replace('-result.json', '-verdict.json')
  const verdict = completedJudge(
    runner,
    existsSync(verdictPath) ? readFileSync(verdictPath, 'utf8') : runner.output
  )
  if (verdict.pass && assertionError) {
    throw assertionError
  }
  return verdict
}

export function nudgeChecks(
  policy: string,
  source: string,
  target: string
): void {
  const path = '/tmp/next-upgrade-eval/nudge-verdict.json'
  const checks: Record<
    string,
    { passed: boolean; evidence: string; judgeCompleted: boolean | null }
  > = {}
  const record = (
    name: string,
    passed: boolean,
    evidence: string,
    judgeCompleted: boolean | null
  ) => {
    checks[name] = { passed, evidence, judgeCompleted }
    writeFileSync(path, JSON.stringify({ checks }, null, 2))
  }
  test('notice-emitted', () => {
    const log = '/tmp/next-upgrade-eval/commands.jsonl'
    const records = existsSync(log)
      ? readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : []
    const passed = noticeEmitted(records, policy, source, target)
    record(
      'notice-emitted',
      passed,
      `Candidate ${source}, policy ${policy}; raw commands.jsonl`,
      null
    )
    expect(passed).toBe(true)
  })
  for (const [name, criterion] of [
    ['notice-mentioned', mentionCriterion(policy)],
    ['nudge-not-discredited', trustCriterion(policy)],
  ]) {
    test(
      name,
      async () => {
        let verdict: { pass: boolean; reason: string }
        try {
          verdict = await judgeCriterion(criterion)
        } catch (error) {
          record(
            name,
            false,
            error instanceof Error ? error.message : String(error),
            false
          )
          throw error
        }
        record(name, verdict.pass, verdict.reason, true)
        expect(verdict.pass).toBe(true)
      },
      180000
    )
  }
}
