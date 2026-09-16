#!/usr/bin/env node
import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tools = dirname(dirname(fileURLToPath(import.meta.url)))
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
  result = []
} else if (args[0] === 'api') {
  const endpoint = args
    .find((arg) => /^(\/)?repos\//.test(arg))
    ?.replace(/^\//, '')
  if (endpoint === 'repos/next-upgrade-eval/fixture') result = repo
  else if (endpoint?.startsWith('repos/next-upgrade-eval/fixture/pulls'))
    result = []
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
