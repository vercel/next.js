import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { transcriptPath } from '@vercel/agent-eval/eval'

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

function feedbackCommands(): string[] {
  const raw = readFileSync(transcriptPath(), 'utf8')
  return [
    ...new Set(
      [...raw.matchAll(/"command"\s*:\s*"((?:\\.|[^"\\])*)"/g)]
        .map((match) => JSON.parse(`"${match[1]}"`) as string)
        .filter((command) =>
          /\bnpx\s+--no-install\s+next\s+feedback(?:\s|$)/.test(command)
        )
    ),
  ]
}

test('fixes the application bug', () => {
  const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8')
  expect(page).toMatch(/operational\s*\?\s*['"]Operational['"]/i)
})

test('does not report routine first-pass debugging', () => {
  expect(reportPayloads()).toHaveLength(0)
  expect(feedbackCommands()).toHaveLength(0)
})
