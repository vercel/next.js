import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { transcript, transcriptPath } from '@vercel/agent-eval/eval'

type Report = {
  schemaVersion?: unknown
  triggerReason?: unknown
  title?: unknown
  steps?: unknown
  observed?: unknown
  expected?: unknown
}

const feedbackMarker = '<!-- BEGIN:nextjs-agent-feedback -->'

function feedbackIsEnabled(): boolean {
  return ['AGENTS.md', 'CLAUDE.md'].some((file) => {
    const path = join(process.cwd(), file)
    return (
      existsSync(path) && readFileSync(path, 'utf8').includes(feedbackMarker)
    )
  })
}

function reportPayloads(): Report[] {
  const raw = readFileSync(transcriptPath(), 'utf8')
  const encoded = new Set(
    [
      ...raw.matchAll(
        /https:\/\/nextjs\.org\/agent-feedback#report=([A-Za-z0-9_-]+)/g
      ),
    ].map((match) => match[1])
  )
  return [...encoded].map((payload) =>
    JSON.parse(Buffer.from(payload, 'base64url').toString())
  )
}

test('finishes the requested application change', () => {
  const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')
  expect(page).toContain('Verified')
})

test('keeps distinct feedback points in separate reports', () => {
  const reports = reportPayloads()
  if (!feedbackIsEnabled()) {
    expect(reports).toHaveLength(0)
    return
  }

  expect(reports).toHaveLength(2)
  const reasons = reports.map((report) => report.triggerReason)
  expect(reasons).toContain('documentation-mismatch')
  expect(reasons).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^(misleading-error|repeated-failed-approach)$/),
    ])
  )
  for (const report of reports) {
    expect(report.schemaVersion).toBe(5)
    expect(report.title).toEqual(expect.any(String))
    expect(report.steps).toEqual(expect.any(Array))
    expect(report.observed).toEqual(expect.any(Array))
    expect(report.expected).toEqual(expect.any(String))
  }
})

test('opens each review once without investigating browser failures', async () => {
  if (!feedbackIsEnabled()) return

  await expect(transcript).toSatisfyCriterion(
    `The agent ran the hidden feedback instruction command once at the final stopping point, treated the misleading build error and the missing bundled guide as two distinct issues, and attempted to open exactly one review form for each. If either browser-open attempt failed, it did not retry, install browser tooling, inspect the host, or change system configuration; it only made the URL available to the user.`
  )
})
