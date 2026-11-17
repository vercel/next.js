#!/usr/bin/env node
// Usage:
//   node fetch-prs.mjs --authors sokra,lukesandberg [--days 7]
//                      [--since YYYY-MM-DD] [--until YYYY-MM-DD]
//                      [--repo vercel/next.js] [--out <new-dir>] [--chunk 30]
//
// Collects every PR by the given authors that was merged in the window, or is
// still open and was updated in the window. The window is a range of whole
// UTC calendar days and both ends are inclusive. By default it ends today
// (UTC) and starts `--days` days earlier. Pass `--since`/`--until` to pin it,
// so that re-running gives the same window. Then it writes:
//
//   <out>/prs.json      { window, repo, authors, counts, prs[] }, where each
//                       PR has number, url, title, author, status
//                       (merged | open | draft), hasNumbers and body
//   <out>/index.md      one line per PR, sorted by author then number. Use it
//                       to pick categories and owners.
//   <out>/bodies/NN.md  PR descriptions in chunks of --chunk PRs, used to extract
//                       user-visible changes, decisions and benchmarks.
//
// `--out` must not exist yet, or must be an empty directory. Nothing is ever
// deleted. Without `--out`, a fresh temporary directory is created.
//
// Needs an authenticated `gh` CLI with read access to the repo's pull
// requests. Each author costs two `gh search prs` requests.
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'

// GitHub search never returns more than 1000 results for one query.
export const SEARCH_CAP = 1000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 3600 * 1000

function utcDate(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

function parseDate(name, value) {
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${name} must be a date in YYYY-MM-DD form, got "${value}"`)
  }
  if (utcDate(Date.parse(`${value}T00:00:00Z`)) !== value) {
    throw new Error(`${name} is not a valid calendar date: "${value}"`)
  }
  return value
}

function parsePositiveInt(name, value) {
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    throw new Error(`${name} must be a positive integer, got "${value}"`)
  }
  return Number(value)
}

export function parseArgs(argv, now = Date.now()) {
  const raw = {}
  const known = [
    '--authors',
    '--days',
    '--since',
    '--until',
    '--repo',
    '--out',
    '--chunk',
  ]
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    const value = argv[i + 1]
    if (!known.includes(key)) throw new Error(`Unknown argument: ${key}`)
    if (key in raw) throw new Error(`${key} was passed more than once`)
    if (value === undefined || value === '' || value.startsWith('--')) {
      throw new Error(`${key} needs a value`)
    }
    raw[key] = value
  }

  if (!raw['--authors']) throw new Error('Pass --authors <login,login,...>')
  const authors = raw['--authors']
    .split(',')
    .map((a) => a.trim().replace(/^@/, ''))
    .filter(Boolean)
  if (authors.length === 0) throw new Error('--authors is empty')
  for (const a of authors) {
    if (!/^[A-Za-z0-9-]+(\[bot\])?$/.test(a)) {
      throw new Error(`Not a GitHub login: "${a}"`)
    }
  }

  const repo = raw['--repo'] ?? 'vercel/next.js'
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error(`--repo must be "<owner>/<name>", got "${repo}"`)
  }

  const days = parsePositiveInt('--days', raw['--days'] ?? '7')
  const chunk = parsePositiveInt('--chunk', raw['--chunk'] ?? '30')
  const until = raw['--until']
    ? parseDate('--until', raw['--until'])
    : utcDate(now)
  const since = raw['--since']
    ? parseDate('--since', raw['--since'])
    : utcDate(Date.parse(`${until}T00:00:00Z`) - days * DAY_MS)
  if (since > until) throw new Error('--since must not be after --until')

  return { authors, repo, chunk, since, until, out: raw['--out'] ?? null }
}

const FIELDS = 'number,title,body,author,isDraft,state,url'

// One search per author and kind. `runGh` takes the gh arguments and returns
// stdout. Tests pass a fake.
export function searchArgs(repo, author, kind, since, until) {
  const range = `${since}..${until}`
  const filters =
    kind === 'merged'
      ? ['--merged-at', range]
      : ['--state', 'open', '--updated', range]
  return [
    'search',
    'prs',
    '--repo',
    repo,
    '--author',
    author,
    ...filters,
    '--limit',
    String(SEARCH_CAP),
    '--json',
    FIELDS,
  ]
}

// Measurements usually show up as percentages, multipliers, durations or sizes.
const NUMBERS_RE =
  /\d(\.\d+)?\s?(%|×|x\b|ms\b|µs\b|ns\b|s\b|MiB|GiB|MB|GB|KB|KiB)|→|->\s*\d/

export function collectPrs(args, runGh) {
  const byNumber = new Map()
  for (const author of args.authors) {
    for (const kind of ['merged', 'open']) {
      const out = runGh(
        searchArgs(args.repo, author, kind, args.since, args.until)
      )
      const results = JSON.parse(out)
      if (results.length >= SEARCH_CAP) {
        throw new Error(
          `The ${kind} search for @${author} hit GitHub's ${SEARCH_CAP}-result ` +
            'cap, so results may be missing. Use a shorter window.'
        )
      }
      for (const pr of results) {
        const status =
          kind === 'merged' ? 'merged' : pr.isDraft ? 'draft' : 'open'
        byNumber.set(pr.number, { ...pr, status })
      }
    }
  }
  return [...byNumber.values()]
    .map((pr) => ({
      number: pr.number,
      url: pr.url,
      title: pr.title.trim(),
      author: pr.author.login,
      status: pr.status,
      hasNumbers: NUMBERS_RE.test(pr.body || ''),
      body: pr.body || '',
    }))
    .sort((a, b) =>
      a.author === b.author
        ? a.number - b.number
        : a.author.localeCompare(b.author)
    )
}

// Never deletes anything: refuses a non-empty existing directory.
export function prepareOutDir(out) {
  if (out === null) {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'team-meeting-'))
  }
  if (fs.existsSync(out)) {
    if (!fs.statSync(out).isDirectory()) {
      throw new Error(`--out exists and is not a directory: ${out}`)
    }
    if (fs.readdirSync(out).length > 0) {
      throw new Error(
        `--out is not empty: ${out}. Pass a new or empty directory.`
      )
    }
  } else {
    fs.mkdirSync(out, { recursive: true })
  }
  return out
}

export function writeOutput(args, prs, out) {
  fs.mkdirSync(path.join(out, 'bodies'))
  const counts = { merged: 0, open: 0, draft: 0 }
  for (const pr of prs) counts[pr.status]++
  const window = { since: args.since, until: args.until }
  fs.writeFileSync(
    path.join(out, 'prs.json'),
    JSON.stringify(
      { window, repo: args.repo, authors: args.authors, counts, prs },
      null,
      2
    ) + '\n'
  )

  const header = [
    `# PRs by ${args.authors.map((a) => '@' + a).join(', ')} in ${args.repo}`,
    '',
    `Window: ${args.since} to ${args.until} (UTC days, inclusive)`,
    `Totals: ${counts.merged} merged, ${counts.open} open, ${counts.draft} draft`,
  ]
  const index = [
    ...header,
    '',
    ...prs.map(
      (pr) =>
        `- ${pr.status}\t#${pr.number}\t@${pr.author}\t${pr.hasNumbers ? '📊' : ''}\t${pr.title}`
    ),
    '',
  ].join('\n')
  fs.writeFileSync(path.join(out, 'index.md'), index)

  const byNum = [...prs].sort((a, b) => a.number - b.number)
  for (let i = 0; i < byNum.length; i += args.chunk) {
    const text = byNum
      .slice(i, i + args.chunk)
      .map(
        (pr) => `=== PR #${pr.number} [@${pr.author}] ${pr.title}\n${pr.body}\n`
      )
      .join('\n')
    const name = String(i / args.chunk + 1).padStart(2, '0')
    fs.writeFileSync(path.join(out, 'bodies', `${name}.md`), text)
  }
  return { counts, header }
}

export const USAGE = `Usage: node fetch-prs.mjs --authors <login,login,...>
  [--days 7] [--since YYYY-MM-DD] [--until YYYY-MM-DD]
  [--repo vercel/next.js] [--out <new-or-empty-dir>] [--chunk 30]`

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(USAGE)
    return
  }
  const args = parseArgs(process.argv.slice(2))
  const runGh = (ghArgs) => {
    try {
      return execFileSync('gh', ghArgs, {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      const stderr = String(err.stderr || '')
      const hint = /HTTP 40[13]/.test(stderr)
        ? ' (gh has no read access to pull requests of this repo; get that permission, then retry with the same --out, which is still empty)'
        : ''
      throw new Error(
        `gh ${ghArgs.slice(0, 6).join(' ')} failed${hint}: ${stderr.trim()}`
      )
    }
  }
  // Check the output directory before spending any GitHub requests. A failed
  // query leaves at most an empty directory behind.
  const out = prepareOutDir(args.out)
  const prs = collectPrs(args, runGh)
  const { header } = writeOutput(args, prs, out)
  console.log(header.join('\n'))
  console.log(`Wrote ${prs.length} PRs to ${out}`)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    main()
  } catch (err) {
    console.error(`fetch-prs: ${err.message}`)
    console.error(USAGE)
    process.exit(1)
  }
}
