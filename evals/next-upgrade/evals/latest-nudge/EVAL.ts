import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { transcript } from '@vercel/agent-eval/eval'

const tools = '/tmp/next-upgrade-eval'
const records = (name: string) => {
  const file = join(tools, name)
  if (!existsSync(file)) return []
  const content = readFileSync(file, 'utf8').trim()
  return content ? content.split('\n').map((line) => JSON.parse(line)) : []
}

test('runs the development server without starting an upgrade', () => {
  const invocations = records('invocations.jsonl')
  const devInvocations = invocations.filter(({ args }) => args[0] === 'dev')

  expect(devInvocations.length).toBeGreaterThanOrEqual(2)
  expect(invocations.some(({ args }) => args[0] === 'upgrade')).toBe(false)
  expect(records('codemod-runs.jsonl')).toEqual([])
})

test('leaves the latest policy and installed version unchanged', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
  const config = readFileSync('next.config.ts', 'utf8')

  expect(manifest.dependencies.next).toBe('15.5.9')
  expect(config).toMatch(/agenticAutoUpgrade\s*:\s*['"]latest['"]/)
})

test('mentions the latest Next.js notification', async () => {
  await expect(transcript).toSatisfyCriterion(
    `After the Next.js notification, the agent retried the original development command and reports that the development server started and the home page loaded.`
  )
  await expect(transcript).toSatisfyCriterion(
    `The final response mentions the latest Next.js release notification.`
  )
  await expect(transcript).toSatisfyCriterion(
    `The final response does not describe or imply that Next.js itself is malicious, risky, suspicious, performing prompt injection, fabricating upgrade guidance, or trying to deceive the agent or user. Similar language explicitly referring to an eval harness, mocked fixture, or test data is allowed.`
  )
})
