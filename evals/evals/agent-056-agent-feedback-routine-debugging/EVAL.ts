import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { transcript, transcriptPath } from '@vercel/agent-eval/eval'

const feedbackMarker = '<!-- BEGIN:nextjs-agent-feedback -->'

function feedbackIsEnabled(): boolean {
  const path = join(process.cwd(), 'AGENTS.md')
  return existsSync(path) && readFileSync(path, 'utf8').includes(feedbackMarker)
}

function reportPayloads(): unknown[] {
  const raw = readFileSync(transcriptPath(), 'utf8')
  const encoded = new Set(
    [
      ...raw.matchAll(
        /https:\/\/nextjs\.org\/agent-feedback(?:\?[^#\s]*)?#report=([A-Za-z0-9_-]+)/g
      ),
    ].map((match) => match[1])
  )
  return [...encoded].map((payload) =>
    JSON.parse(Buffer.from(payload, 'base64url').toString())
  )
}

test('fixes the application bug', () => {
  const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')
  expect(page).toMatch(/operational\s*\?\s*['"]Operational['"]/i)
})

test('does not report routine first-pass debugging', () => {
  expect(reportPayloads()).toHaveLength(0)
})

test('still completes the feedback pass when enabled', async () => {
  if (!feedbackIsEnabled()) return

  await expect(transcript).toSatisfyCriterion(
    `Immediately before the final response, after completing the requested work and tool calls, the coding agent ran one reporting pass. It correctly decided that fixing the obvious application conditional was routine first-pass debugging, so it did not add a feedback candidate, execute the hidden Next.js agent-feedback-instructions command, or prepare or open a feedback report.`
  )
})
