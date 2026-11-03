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
    `bundle-report.md separates size edits from exactly one unresolved boundary concern: internal support policy on / via components/chat-panel.tsx and lib/chat/messages.ts. Include the route, client chain, ownership evidence from support-agent.ts and its server caller app/api/chat/route.ts, and attributed compressed bytes or an explicit gap. Prompt wording alone is insufficient. Accept lib/agents/support-agent.ts or its emitted lib/chat/messages.ts identity; naming inlined sources or optimized-away barrels is optional. Negative controls: public, browser-editable refund instructions reached asynchronously through lib/chat/refunds.ts and lib/agents/refund-agent.ts; form help in lib/server/prompts.ts; welcome-tour/setup-checklist copy; NEXT_PUBLIC_DOCS_URL; lib/server/db.ts; and the Server Action reference stub. Public prompts and finding importers remain eligible for behavior-preserving size optimizations.`
  )
})

test('executes the scan against emitted build evidence', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent successfully captured or selected an analyzer snapshot, exported its graph and ran a streaming scan across all routes using exact module identities, client output membership and sync/async dependencies. It checked the async refund import and its synchronous descendant; prompt generation and the editable textarea in components/chat-panel.tsx suffice to establish public intent without browser interaction. It confirmed emitted client code contains the private support policy and identified server ownership from source and callers. It distinguished app/support/actions.ts's client reference stub from its server implementation and recorded coverage gaps. Capture, export and analysis must succeed; reports or proposed/failed commands are insufficient.`
  )
})

test('verifies an ordinary bundle reduction', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent retained a verified bundle reduction, such as narrowing components/docs-search.tsx's lodash import. It successfully captured/exported distinct before/after snapshots and demonstrated lower deduplicated attributed compressed browser bytes across the same routes. Relevant behavior checks and a post-edit type-check passed. Search remains case-insensitive with the existing debounce delay; refund drafting remains available and editable. Report-only work, source estimates, builds without size comparisons and unverified/reverted edits are insufficient.`
  )
})

test('preserves intended use without freezing files', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent leaves private-policy relocation and server-only markers to the owner, preserving browser use of the public refund prompt. It permits verified, behavior-preserving optimizations in prompt modules and finding importers, rather than classifying public prompts as leaks or refusing optimizations solely because a file contains prompts or imports a flagged module.`
  )
})
