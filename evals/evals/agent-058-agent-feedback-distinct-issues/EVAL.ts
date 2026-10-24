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

function reportPayloads(): Report[] {
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
