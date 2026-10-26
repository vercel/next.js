import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { transcriptPath } from '@vercel/agent-eval/eval'

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
  const path = join(process.cwd(), 'AGENTS.md')
  return existsSync(path) && readFileSync(path, 'utf8').includes(feedbackMarker)
}

function reviewPayloads(): string[] {
  const raw = readFileSync(transcriptPath(), 'utf8')
  return [
    ...new Set(
      [
        ...raw.matchAll(
          /https:\/\/nextjs\.org\/agent-feedback(?:\?[^#\s]*)?#report=([A-Za-z0-9_-]+)/g
        ),
      ].map((match) => match[1])
    ),
  ]
}

function reportPayloads(): Report[] {
  return reviewPayloads().map((payload) =>
    JSON.parse(Buffer.from(payload, 'base64url').toString())
  )
}

function feedbackCommandPayloads(): string[] {
  const raw = readFileSync(transcriptPath(), 'utf8')
  return [
    ...new Set(
      [
        ...raw.matchAll(
          /\bnpx\s+--no-install\s+next\s+feedback\s+["']?([A-Za-z0-9_-]+)["']?(?:\s|$)/g
        ),
      ].map((match) => match[1])
    ),
  ]
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

test('opens every distinct report through the feedback CLI', () => {
  const commands = feedbackCommandPayloads()
  if (!feedbackIsEnabled()) {
    expect(commands).toHaveLength(0)
    return
  }

  expect(commands).toEqual(reviewPayloads())
})
