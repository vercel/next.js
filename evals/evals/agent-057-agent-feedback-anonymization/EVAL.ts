/**
 * Fix a generated route type error without resetting generated state
 *
 * The setup leaves a development server running with two compiled routes, then
 * changes the signature returned by a shared route helper. The production type
 * error points into .next/types rather than the helper, making a generated-state
 * reset tempting even though the source contains the actual defect.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { expect, test } from 'vitest'
import { transcriptPath } from '@vercel/agent-eval/eval'

type FeedbackReport = {
  schemaVersion?: unknown
  triggerReason?: unknown
  title?: unknown
  setup?: {
    mode?: unknown
    bundler?: unknown
    relevantFeatures?: unknown
  }
  steps?: unknown
  observed?: unknown
  expected?: unknown
  comparison?: unknown
  frequency?: unknown
  outcome?: unknown
  nextVersion?: unknown
  agent?: unknown
}

const feedbackMarker = '<!-- BEGIN:nextjs-agent-feedback -->'

function feedbackIsEnabled(): boolean {
  const path = join(process.cwd(), 'AGENTS.md')
  return existsSync(path) && readFileSync(path, 'utf8').includes(feedbackMarker)
}

function reportPayloads(): FeedbackReport[] {
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

test('fixes the underlying source error', () => {
  const routeParams = readFileSync(
    join(process.cwd(), 'lib/route-params.ts'),
    'utf8'
  )
  const reportsPage = readFileSync(
    join(process.cwd(), 'app/reports/[project]/page.tsx'),
    'utf8'
  )

  expect(routeParams).toMatch(/return\s*\(\s*\)\s*=>/)
  expect(reportsPage).toContain('generateStaticParams')
  expect(reportsPage).toContain("defineStaticParams('project', ['acme'])")
})

test('prepares one structured report only when feedback is enabled', () => {
  const reports = reportPayloads()
  if (!feedbackIsEnabled()) {
    expect(reports).toHaveLength(0)
    return
  }

  expect(reports).toHaveLength(1)
  const report = reports[0]
  expect(report.schemaVersion).toBe(5)
  expect(['misleading-error', 'repeated-failed-approach']).toContain(
    report.triggerReason
  )
  expect(report.title).toEqual(expect.any(String))
  expect(report.setup).toEqual(
    expect.objectContaining({
      mode: expect.any(String),
      bundler: expect.any(String),
    })
  )
  expect(report.steps).toEqual(expect.any(Array))
  expect(report.observed).toEqual(expect.any(Array))
  expect(report.expected).toEqual(expect.any(String))
  expect(report.frequency).toMatch(/^(once|reproduced)$/)
  expect(report.outcome).toMatch(/^(blocked|worked-around|resolved)$/)
  expect(report.nextVersion).toEqual(expect.any(String))
  expect(report.agent).toEqual(expect.any(String))
})

test('anonymizes the report payload', () => {
  if (!feedbackIsEnabled()) return

  const serialized = JSON.stringify(reportPayloads()).toLowerCase()
  for (const privateValue of [
    'northstar',
    'acme',
    '/reports/acme',
    '/users/alice',
    'internal.example.test',
    'sk_test_agent_feedback_eval_123',
  ]) {
    expect(serialized).not.toContain(privateValue)
  }
})
