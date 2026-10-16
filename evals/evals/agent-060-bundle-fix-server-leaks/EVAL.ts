// Public prompts remain eligible for optimization without changing ownership.

import { expect, test } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { environment, transcript } from '@vercel/agent-eval/eval'

const reportPath = join(process.cwd(), 'bundle-report.md')
const report = existsSync(reportPath) ? readFileSync(reportPath, 'utf-8') : ''

function leakSection(markdown: string) {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) =>
    /^#{1,6}\s.*server[- ]only leak/i.test(line)
  )
  if (start === -1) return ''
  const level = lines[start].match(/^#+/)![0].length
  const end = lines.findIndex(
    (line, i) => i > start && new RegExp(`^#{1,${level}}\\s`).test(line)
  )
  return lines.slice(start, end === -1 ? undefined : end).join('\n')
}

const leaks = leakSection(report)

test('still reports every leak in its own section', () => {
  expect(leaks).toMatch(/lib\/chat\/messages/)
})

test('distinguishes unintended exposure from public prompts', async () => {
  await expect(environment).toSatisfyCriterion(
    `bundle-report.md reports one unresolved boundary concern: internal support policy on / via components/chat-panel.tsx and lib/chat/messages.ts. It gives the route, client chain, ownership evidence and attributed compressed bytes (or an attribution gap). The source identifies this as server-side policy and app/api/chat/route.ts imports it for the server handler; prompt wording alone is insufficient. Either lib/agents/support-agent.ts or its emitted lib/chat/messages.ts identity is acceptable, without naming inlined sources or optimized-away barrels. No other module is reported as a leak. The async refund instructions in lib/chat/refunds.ts and lib/agents/refund-agent.ts are intentionally public and browser-editable. Form help text in lib/server/prompts.ts, welcome-tour and setup-checklist copy, NEXT_PUBLIC_DOCS_URL, lib/server/db.ts and the Server Action reference stub are negative controls. Public prompts and files on a finding's import chain remain eligible for ordinary optimizations that preserve intended use; those size edits must be distinguished from boundary repairs.`
  )
})

test('executes the scan against emitted build evidence', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent successfully captured or selected a saved analyzer build snapshot, exported its graph and executed a streaming analysis across all routes using exact module identities, client output membership and sync and async dependencies. It inspected the async refund import and its synchronous descendant and established that the refund prompt is intentionally public. Source inspection of the prompt generation and editable textarea binding in components/chat-panel.tsx is sufficient evidence of public intent; interactive browser use is not required for this classification. It confirmed the private support policy survives in emitted client code and used source ownership and server callers to identify the unintended exposure. It distinguished the Server Action reference stub from app/support/actions.ts's server implementation and accounted for coverage gaps. The capture/export and graph analysis must actually succeed; a written report or proposed/failed commands cannot substitute for executing them.`
  )
})

test('verifies an ordinary bundle reduction', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent retained an ordinary bundle optimization, such as narrowing the lodash import in components/docs-search.tsx. It successfully captured and exported distinct before and after snapshots and compared deduplicated attributed compressed browser bytes across the same routes, showing a reduction. It ran relevant behavior checks and a successful type-check after the edit. Documentation search still filters case-insensitively after the existing debounce delay; the refund drafting prompt remains available and editable. A report-only run, a source-only estimate, a build without a size comparison or an unverified/reverted edit does not satisfy this criterion.`
  )
})

test('preserves intended use without freezing files', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent preserves intended runtime ownership: it leaves decisions about moving the private support policy or adding server-only markers to the owner, and keeps the public refund prompt usable in the browser. Ordinary bundle edits to prompt modules or their importers are permitted when behavior is verified. It does not classify the public refund prompt as a leak or refuse an otherwise valid optimization solely because a file contains prompts or imports a flagged module.`
  )
})
