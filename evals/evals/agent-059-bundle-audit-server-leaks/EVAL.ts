// Server-owned policy reaches the client through a shared utility.
// The lazy, user-editable refund prompt is intentional browser content.

import { expect, test } from 'vitest'
import { createHash } from 'crypto'
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
const rest = report.replace(leaks, '')

// Regenerate with: shasum -a 256 <file>
const SOURCE_HASHES: Record<string, string> = {
  'app/admin/page.tsx':
    '6d49a87e40b38a9fb5a3afe8f151a3935e48f9167cab4f20ba52539c86049a0a',
  'app/api/chat/route.ts':
    '1dcc04405957ecf2ddb512287ed455602ae7f8fc16a614f7906c5bd34911f8ff',
  'app/layout.tsx':
    '58551dbe855cbff42a571a1ce93fbed1c8309d0cff154f4e0790b25b1cc1c053',
  'app/page.tsx':
    'afaec61603086905cf09cfca68b309c1b3e31324bc7f8b8839366d7aea5e7ace',
  'app/support/actions.ts':
    '6ee09cc4815954a34db95c986736895e0be1a9adf5fd76ebf3e86e54a7824a4a',
  'app/support/page.tsx':
    '5f54f14a0407ae4a0bebbafd1bcdfdcbc5efeaab57dcf814e8a795f9de08d994',
  'app/support/ticket-form.tsx':
    '643e3e37969450b730a7a44592a8fd00aba59774d175dbf51688e3f97854209b',
  'components/chat-panel.tsx':
    'bca9679c521592ccde10abef8d399b7befeacdc2675387c889650ee6c842c149',
  'components/docs-search.tsx':
    'a855bd22580b0e04fe853a3ab60c84665655c41e1595c14f0b4a97085d11c3d7',
  'components/setup-checklist.tsx':
    '8ada5936b96305f50548f6acc1356bb176e375629ac5da61e26a047b7eaf418d',
  'components/welcome-tour.tsx':
    '667a48578f8bd8b528a0a5657a0aaae04f301da81a3f1f55fe5e3c7dd8622e9b',
  'lib/agents/index.ts':
    'a952e52e107a78b2c57082f1e79421fe3a811997c235e134964958779ff89ed3',
  'lib/agents/refund-agent.ts':
    '21827fccc19e3987ef6916ee3d714ed1056e86869b134ab2f8d45d7f0756f300',
  'lib/agents/support-agent.ts':
    'babb15703336ed9a572cd097c3338081f7368f3dff7a92f10f8da9576510a629',
  'lib/chat/messages.ts':
    'b09b5a6f641b8d12e2f0467f2d67d3194eb58802f45696feac51a2d6b93783c9',
  'lib/chat/refunds.ts':
    '87436f7d8c5dc7691039d1f48580540ba6b9b2cf35f7594097b5031ed05d25da',
  'lib/server/db.ts':
    '4f1b76003261d0045fc68284b481beab2be7159a781dc5b6ef5f9910b0b5f699',
  'lib/server/prompts.ts':
    'aa800a724a9c395ce99bd5e1a7ff4f663ecf5f1502b12a43619aadfaa0e835ef',
  'next.config.ts':
    'e1e907f8890394ee8b2e1f414bf093036baee3dd710103ad65ba550cb02f6271',
}

test('leaves the app unchanged', () => {
  for (const [file, hash] of Object.entries(SOURCE_HASHES)) {
    const contents = readFileSync(join(process.cwd(), file))
    expect(createHash('sha256').update(contents).digest('hex'), file).toBe(hash)
  }
})

test('reports leaks in their own section', () => {
  expect(leaks).not.toBe('')
})

test('reports every positive with its import chain', () => {
  expect(leaks).toMatch(/lib\/chat\/messages/)
  expect(leaks).toMatch(/chat-panel/)
})

test('still ranks the ordinary size candidate', () => {
  expect(rest).toMatch(/lodash/)
})

test('keeps leak findings out of the size ranking', async () => {
  await expect(environment).toSatisfyCriterion(
    `bundle-report.md reports one possible server-only leak, separate from size candidates: internal support policy on /, via components/chat-panel.tsx and lib/chat/messages.ts. It gives the route, client import chain, ownership evidence and attributed compressed bytes (or an explicit attribution gap). The support-agent.ts source identifies this as server-side policy and app/api/chat/route.ts imports it for the server handler; the finding must use that context rather than prompt wording alone. Either lib/agents/support-agent.ts or its emitted lib/chat/messages.ts identity is acceptable; inlined sources and optimized-away barrels need not be named. No other module is reported as a leak. The refund instructions reached through the async import of lib/chat/refunds.ts are intentionally public and editable in the browser. lib/server/prompts.ts contains ordinary form help text. Welcome-tour and setup-checklist copy, NEXT_PUBLIC_DOCS_URL and lib/server/db.ts are also negative controls. app/support/actions.ts ships a client reference stub, not TRIAGE_INSTRUCTIONS. Controls may be discussed as suppressed matches or contrasts and public prompts may appear as ordinary size candidates.`
  )
})

test('executes the scan against emitted build evidence', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent successfully captured or selected a saved analyzer build snapshot, exported its graph and executed a streaming analysis across all routes using exact module identities, client output membership and sync and async dependencies. It inspected the async refund import and its synchronous descendant and established that the refund prompt is intentionally public. Source inspection of the prompt generation and editable textarea binding in components/chat-panel.tsx is sufficient evidence of public intent; interactive browser use is not required for this classification. It confirmed the private support policy survives in emitted client code and used source ownership and server callers to identify the unintended exposure. It distinguished the Server Action reference stub from app/support/actions.ts's server implementation and accounted for coverage gaps. The capture/export and graph analysis must actually succeed; a written report or proposed/failed commands cannot substitute for executing them.`
  )
})
