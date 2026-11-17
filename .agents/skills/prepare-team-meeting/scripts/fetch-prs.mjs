#!/usr/bin/env node
// Usage:
//   node fetch-prs.mjs --authors sokra,lukesandberg [--days 7] [--repo vercel/next.js]
//                      [--out /tmp/team-meeting] [--chunk 30]
//
// Collects every PR by the given authors that was merged in the last N days
// or is still open and was updated in the last N days, then writes:
//
//   <out>/prs.json      one entry per PR: number, url, title, author, status
//                       (merged | open | draft), hasNumbers, body
//   <out>/index.md      one line per PR, sorted by author then number. Use it
//                       to pick categories and owners.
//   <out>/bodies/NN.md  PR descriptions in chunks of --chunk PRs. Ask a
//                       cheaper model for the benchmark numbers in each chunk
//                       instead of reading 1 MB of descriptions yourself.
//
// Needs an authenticated `gh` CLI with read access to the repo's pull
// requests. Each author costs two `gh search prs` requests.
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

function parseArgs(argv) {
  const args = {
    authors: [],
    days: 7,
    repo: 'vercel/next.js',
    out: path.join(process.env.TMPDIR || '/tmp', 'team-meeting'),
    chunk: 30,
  }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const value = argv[i + 1]
    switch (key) {
      case '--authors':
        args.authors = value
          .split(',')
          .map((a) => a.trim().replace(/^@/, ''))
          .filter(Boolean)
        i++
        break
      case '--days':
        args.days = Number(value)
        i++
        break
      case '--repo':
        args.repo = value
        i++
        break
      case '--out':
        args.out = value
        i++
        break
      case '--chunk':
        args.chunk = Number(value)
        i++
        break
      default:
        throw new Error(`Unknown argument: ${key}`)
    }
  }
  if (args.authors.length === 0) {
    throw new Error('Pass --authors <login,login,...>')
  }
  if (!Number.isFinite(args.days) || args.days <= 0) {
    throw new Error('--days must be a positive number')
  }
  return args
}

const FIELDS = 'number,title,body,author,isDraft,state,url,updatedAt,closedAt'

function search(repo, author, filters) {
  const out = execFileSync(
    'gh',
    [
      'search',
      'prs',
      '--repo',
      repo,
      '--author',
      author,
      ...filters,
      '--limit',
      '1000',
      '--json',
      FIELDS,
    ],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
  )
  return JSON.parse(out)
}

// Measurements usually show up as percentages, multipliers, durations or sizes.
const NUMBERS_RE =
  /\d(\.\d+)?\s?(%|×|x\b|ms\b|µs\b|ns\b|s\b|MiB|GiB|MB|GB|KB|KiB)|→|->\s*\d/

function main() {
  const args = parseArgs(process.argv.slice(2))
  const since = new Date(Date.now() - args.days * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)

  const byNumber = new Map()
  for (const author of args.authors) {
    const merged = search(args.repo, author, ['--merged-at', `>=${since}`])
    const open = search(args.repo, author, [
      '--state',
      'open',
      '--updated',
      `>=${since}`,
    ])
    for (const pr of merged) {
      byNumber.set(pr.number, { ...pr, status: 'merged' })
    }
    for (const pr of open) {
      byNumber.set(pr.number, {
        ...pr,
        status: pr.isDraft ? 'draft' : 'open',
      })
    }
  }

  const prs = [...byNumber.values()]
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

  fs.rmSync(args.out, { recursive: true, force: true })
  fs.mkdirSync(path.join(args.out, 'bodies'), { recursive: true })
  fs.writeFileSync(
    path.join(args.out, 'prs.json'),
    JSON.stringify(prs, null, 2) + '\n'
  )

  const counts = { merged: 0, open: 0, draft: 0 }
  for (const pr of prs) counts[pr.status]++
  const index = [
    `# PRs by ${args.authors.map((a) => '@' + a).join(', ')} since ${since}`,
    '',
    `Totals: ${counts.merged} merged, ${counts.open} open, ${counts.draft} draft`,
    '',
    ...prs.map(
      (pr) =>
        `- ${pr.status}\t#${pr.number}\t@${pr.author}\t${pr.hasNumbers ? '📊' : ''}\t${pr.title}`
    ),
    '',
  ].join('\n')
  fs.writeFileSync(path.join(args.out, 'index.md'), index)

  const byNum = [...prs].sort((a, b) => a.number - b.number)
  for (let i = 0; i < byNum.length; i += args.chunk) {
    const chunk = byNum.slice(i, i + args.chunk)
    const text = chunk
      .map(
        (pr) => `=== PR #${pr.number} [@${pr.author}] ${pr.title}\n${pr.body}\n`
      )
      .join('\n')
    const name = String(i / args.chunk + 1).padStart(2, '0')
    fs.writeFileSync(path.join(args.out, 'bodies', `${name}.md`), text)
  }

  console.log(index.split('\n').slice(0, 3).join('\n'))
  console.log(`Wrote ${prs.length} PRs to ${args.out}`)
}

main()
