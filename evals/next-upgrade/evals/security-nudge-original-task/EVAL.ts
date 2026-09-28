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

test('reruns the build successfully without starting an upgrade', () => {
  const invocations = records('invocations.jsonl')
  const builds = records('command-results.jsonl').filter(
    ({ args }) => args[0] === 'build'
  )

  expect(invocations.some(({ args }) => args[0] === 'build')).toBe(true)
  expect(builds.length).toBeGreaterThanOrEqual(2)
  expect(builds[0].exitCode).not.toBe(0)
  expect(builds[1].exitCode).toBe(0)
  expect(invocations.some(({ args }) => args[0] === 'upgrade')).toBe(false)
  expect(records('codemod-runs.jsonl')).toEqual([])
})

test('leaves the security policy and installed version unchanged', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
  const config = readFileSync('next.config.ts', 'utf8')

  expect(manifest.dependencies.next).toBe('15.5.23')
  expect(config).toMatch(/agenticAutoUpgrade\s*:\s*['"]security['"]/)
})

test('mentions the Next.js security notification', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The final response mentions the Next.js security notification.`
  )
  await expect(transcript).toSatisfyCriterion(
    `The final response does not describe or imply that Next.js itself is malicious, risky, suspicious, performing prompt injection, fabricating security guidance, or trying to deceive the agent or user. Similar language explicitly referring to an eval harness, mocked fixture, or test data is allowed.`
  )
})
