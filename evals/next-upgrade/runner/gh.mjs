#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// A read-only GitHub CLI for duplicate-check cases. Pull requests come from
// trusted fixture data and diffs from the fixture's local bare remote.
const tools = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
appendFileSync(join(tools, 'gh.jsonl'), JSON.stringify({ args }) + '\n')
const repository = JSON.parse(readFileSync(join(tools, 'gh.json'), 'utf8'))

const option = (name) => {
  for (let index = 0; index < args.length; index++) {
    if (args[index] === name) return args[index + 1]
    if (args[index].startsWith(`${name}=`)) {
      return args[index].slice(name.length + 1)
    }
  }
  return undefined
}
const positional = () => {
  const values = []
  for (let index = 2; index < args.length; index++) {
    if (args[index].startsWith('-')) {
      if (!args[index].includes('=') && !isFlag(args[index])) index++
      continue
    }
    values.push(args[index])
  }
  return values
}
const isFlag = (name) =>
  ['--web', '--comments', '--patch', '--name-only', '--color'].includes(name)
const fail = (message) => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
const print = (value) => {
  const fields = option('--json')
  const selected = fields
    ? Array.isArray(value)
      ? value.map((item) => pick(item, fields))
      : pick(value, fields)
    : value
  const jq = option('--jq') ?? option('-q')
  const text = JSON.stringify(selected, null, 2)
  if (jq) {
    const result = spawnSync('jq', ['-r', jq], {
      input: text,
      encoding: 'utf8',
    })
    if (result.error) {
      fail('jq is unavailable; rerun without --jq')
    }
    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }
  process.stdout.write(text + '\n')
}
const pick = (item, fields) =>
  Object.fromEntries(
    fields
      .split(',')
      .map((field) => field.trim())
      .filter((field) => field in item)
      .map((field) => [field, item[field]])
  )
const find = (reference) => {
  const value = String(reference ?? '').replace(/^#/, '')
  const match = repository.pullRequests.find(
    (pull) =>
      String(pull.number) === value ||
      pull.url === value ||
      pull.headRefName === value
  )
  if (!match) fail(`no pull requests found for ${reference}`)
  return match
}

const [group, command] = args
if (group === 'auth' && command === 'status') {
  process.stdout.write(
    `github.com\n  ✓ Logged in to github.com account ${repository.viewer}\n`
  )
} else if (group === 'repo' && command === 'view') {
  print({
    name: repository.name,
    nameWithOwner: repository.nameWithOwner,
    url: repository.url,
    defaultBranchRef: { name: repository.defaultBranch },
  })
} else if (group === 'pr' && command === 'list') {
  const state = (option('--state') ?? option('-s') ?? 'open').toUpperCase()
  const head = option('--head') ?? option('-H')
  const limit = Number(option('--limit') ?? option('-L') ?? 30)
  print(
    repository.pullRequests
      .filter((pull) => state === 'ALL' || pull.state === state)
      .filter((pull) => !head || pull.headRefName === head)
      .slice(0, limit)
  )
} else if (group === 'pr' && command === 'view') {
  const pull = find(positional()[0])
  if (option('--json')) {
    print(pull)
  } else {
    process.stdout.write(
      `${pull.title} #${pull.number}\n${pull.state} • ${pull.author.login} wants to merge into ${pull.baseRefName} from ${pull.headRefName}\n\n${pull.body}\n\nView this pull request on GitHub: ${pull.url}\n`
    )
  }
} else if (group === 'pr' && command === 'diff') {
  const pull = find(positional()[0])
  const range = `origin/${pull.baseRefName}...origin/${pull.headRefName}`
  process.stdout.write(
    execFileSync(
      'git',
      ['diff', ...(args.includes('--name-only') ? ['--name-only'] : []), range],
      { encoding: 'utf8' }
    )
  )
} else if (
  group === 'pr' &&
  ['create', 'edit', 'merge', 'close'].includes(command)
) {
  fail('Publishing is disabled in this eval repository.')
} else {
  fail(`gh ${args.join(' ')} is unavailable in this eval repository.`)
}
