import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const tools = process.argv[3] ?? '/tmp/next-upgrade-eval'
const root = process.argv[2]
try {
  const git = (cwd, args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const paths = git(root, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice(9))
  const excluded = new Set([
    '.git',
    '.next',
    'node_modules',
    '__agent_eval__',
    '.vercel',
    '.codex',
    '.claude',
    'dist',
    'build',
  ])
  let total = 0
  const trees = paths.map((path) => {
    const files = {}
    const visit = (directory, prefix) => {
      for (const name of readdirSync(directory)) {
        if (
          excluded.has(name) ||
          name.startsWith('.env') ||
          name.endsWith('.log') ||
          name.endsWith('.tsbuildinfo')
        ) {
          continue
        }
        const file = join(directory, name)
        const key = prefix ? `${prefix}/${name}` : name
        const stat = lstatSync(file)
        if (stat.isSymbolicLink()) {
          throw new Error(`Unsupported source symlink ${key}`)
        }
        if (stat.isDirectory()) {
          visit(file, key)
        } else if (stat.isFile()) {
          total += stat.size
          if (total > 50 * 1024 * 1024) {
            throw new Error('Delivered source exceeds 50 MiB')
          }
          files[key] = readFileSync(file).toString('base64')
        }
      }
    }
    visit(path, '')
    return {
      path,
      head: git(path, ['rev-parse', 'HEAD']),
      status: git(path, ['status', '--porcelain=v1']),
      files,
    }
  })
  const evidence = {}
  for (const name of [
    'commands.jsonl',
    'invocations.jsonl',
    'upstream.jsonl',
    'upstream.json',
    'baseline.json',
    'package-runner.json',
  ]) {
    if (existsSync(join(tools, name))) {
      evidence[name] = readFileSync(join(tools, name), 'utf8')
    }
  }
  writeFileSync(
    join(tools, 'artifact.json'),
    JSON.stringify({ trees, evidence, capturedAt: new Date().toISOString() })
  )
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  const kind =
    /Unsupported source symlink|Delivered source exceeds|not a git repository|invalid gitfile|not a valid object name|bad object HEAD/.test(
      reason
    )
      ? 'delivery'
      : 'transport'
  writeFileSync(
    join(tools, 'capture-failure.json'),
    JSON.stringify({ kind, reason })
  )
  throw error
}
