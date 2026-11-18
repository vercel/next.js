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

function feedbackCommands(): string[] {
  const raw = readFileSync(transcriptPath(), 'utf8')
  return [
    ...new Set(
      [...raw.matchAll(/"command"\s*:\s*"((?:\\.|[^"\\])*)"/g)]
        .map((match) => JSON.parse(`"${match[1]}"`) as string)
        .filter((command) =>
          /\bnpx\s+--no-install\s+next\s+internal\s+agent-feedback(?:\s|$)/.test(
            command
          )
        )
    ),
  ]
}

test('finishes the requested application change', () => {
  const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')
  expect(page).toContain('Verified')
})

test('reports the documentation mismatch but not the expected upgrade stop', () => {
  const reports = reportPayloads()
  if (!feedbackIsEnabled()) {
    expect(reports).toHaveLength(0)
    return
  }

  expect(reports).toHaveLength(1)
  expect(reports[0]).toEqual(
    expect.objectContaining({
      schemaVersion: expect.any(Number),
      triggerReason: 'documentation-mismatch',
      title: expect.any(String),
      steps: expect.any(Array),
      observed: expect.any(Array),
      expected: expect.any(String),
    })
  )

  const serialized = JSON.stringify(reports[0]).toLowerCase()
  expect(serialized).not.toContain('securityfatalerror')
  expect(serialized).not.toContain('upgradenudgeerror')
  expect(serialized).not.toContain('upgrade recommendation')
})

test('opens the qualifying report through the feedback CLI', () => {
  const commands = feedbackCommands()
  if (!feedbackIsEnabled()) {
    expect(commands).toHaveLength(0)
    return
  }

  expect(commands.length).toBeGreaterThan(0)
})
