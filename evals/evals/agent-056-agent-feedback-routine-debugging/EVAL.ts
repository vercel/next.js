import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { transcript, transcriptPath } from '@vercel/agent-eval/eval'

const feedbackMarker = '<!-- BEGIN:nextjs-agent-feedback -->'

function feedbackIsEnabled(): boolean {
  return ['AGENTS.md', 'CLAUDE.md'].some((file) => {
    const path = join(process.cwd(), file)
    return (
      existsSync(path) && readFileSync(path, 'utf8').includes(feedbackMarker)
    )
  })
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
    `At the final stopping point, the coding agent executed the hidden Next.js agent-feedback-instructions command exactly once. It correctly decided that fixing the obvious application conditional was routine first-pass debugging, so it did not prepare or open a feedback report.`
  )
})
