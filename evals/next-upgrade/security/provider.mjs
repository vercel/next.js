#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tools = dirname(dirname(fileURLToPath(import.meta.url)))
const { duplicate, target } = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'assessment.json'),
    'utf8'
  )
)
const args = process.argv.slice(2)
appendFileSync(join(tools, 'provider.jsonl'), JSON.stringify({ args }) + '\n')

const repo = {
  name: 'fixture',
  nameWithOwner: 'next-upgrade-eval/fixture',
  full_name: 'next-upgrade-eval/fixture',
  url: 'https://github.com/next-upgrade-eval/fixture',
  html_url: 'https://github.com/next-upgrade-eval/fixture',
  defaultBranchRef: { name: 'main' },
  default_branch: 'main',
  owner: { login: 'next-upgrade-eval' },
}
const pullRequest = {
  number: 42,
  title: `Upgrade Next.js to ${target}`,
  body: '<!-- next-upgrade: security; path="." -->',
  url: 'https://github.com/next-upgrade-eval/fixture/pull/42',
  html_url: 'https://github.com/next-upgrade-eval/fixture/pull/42',
  state: 'OPEN',
  headRefName: 'security-upgrade',
  baseRefName: 'main',
  head: { ref: 'security-upgrade' },
  base: { ref: 'main' },
}
const pullRequestFiles = [
  {
    filename: 'package.json',
    status: 'modified',
    patch: `@@ -9,1 +9,1 @@\n-    "next": "15.5.23"\n+    "next": "${target}"`,
  },
]
let result

if (args[0] === 'auth' && args[1] === 'status') {
  console.log('github.com: authenticated as upgrade-eval')
  process.exit(0)
} else if (args[0] === 'repo' && args[1] === 'view') {
  result = repo
} else if (
  (args[0] === 'pr' && args[1] === 'list') ||
  (args[0] === 'search' && args[1] === 'prs')
) {
  result = duplicate ? [pullRequest] : []
} else if (args[0] === 'pr' && args[1] === 'view' && duplicate) {
  result = pullRequest
} else if (args[0] === 'pr' && args[1] === 'diff' && duplicate) {
  process.stdout.write(`${pullRequestFiles[0].patch}\n`)
  process.exit(0)
} else if (args[0] === 'api') {
  const endpoint = args
    .find((arg) => /^(\/)?repos\//.test(arg))
    ?.replace(/^\//, '')
  if (endpoint === 'repos/next-upgrade-eval/fixture') result = repo
  else if (
    endpoint?.startsWith('repos/next-upgrade-eval/fixture/pulls/42/files')
  )
    result = duplicate ? pullRequestFiles : []
  else if (endpoint?.startsWith('repos/next-upgrade-eval/fixture/pulls/42'))
    result = duplicate ? pullRequest : undefined
  else if (endpoint?.startsWith('repos/next-upgrade-eval/fixture/pulls'))
    result = duplicate ? [pullRequest] : []
  else if (args.includes('user') || args.includes('/user'))
    result = { login: 'upgrade-eval' }
}

if (result === undefined) {
  console.error(`Unsupported evaluation provider read: ${JSON.stringify(args)}`)
  process.exit(1)
}

const json = args.indexOf('--json')
if (json !== -1 && !Array.isArray(result)) {
  result = Object.fromEntries(
    args[json + 1].split(',').map((field) => [field, result[field]])
  )
}
console.log(JSON.stringify(result))
