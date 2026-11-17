// Offline tests for fetch-prs.mjs. Run with:
//   node --test .agents/skills/prepare-team-meeting/scripts/fetch-prs.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  SEARCH_CAP,
  collectPrs,
  parseArgs,
  prepareOutDir,
  searchArgs,
  writeOutput,
} from './fetch-prs.mjs'

const NOW = Date.parse('2026-11-17T14:00:00Z')
const SCRIPT = fileURLToPath(new URL('./fetch-prs.mjs', import.meta.url))

test('CLI: --help prints usage, bad options exit 1 without calling gh', () => {
  const help = spawnSync(process.execPath, [SCRIPT, '--help'], {
    encoding: 'utf8',
  })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /^Usage: node fetch-prs.mjs --authors/)
  const bad = spawnSync(
    process.execPath,
    [SCRIPT, '--authors', 'a', '--chunk', '0'],
    // An empty PATH makes any `gh` call fail differently.
    { encoding: 'utf8', env: { PATH: '' } }
  )
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /--chunk must be a positive integer/)
  assert.match(bad.stderr, /Usage:/)
})

function pr(number, author, extra = {}) {
  return {
    number,
    title: ` PR ${number} `,
    body: '',
    author: { login: author },
    url: `https://github.com/vercel/next.js/pull/${number}`,
    isDraft: false,
    ...extra,
  }
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-prs-test-'))
}

test('parseArgs: default window is the last N whole UTC days', () => {
  const args = parseArgs(['--authors', '@a,b'], NOW)
  assert.deepEqual(args.authors, ['a', 'b'])
  assert.equal(args.since, '2026-11-10')
  assert.equal(args.until, '2026-11-17')
  assert.equal(args.chunk, 30)
  assert.equal(args.out, null)
})

test('parseArgs: --since/--until pin the window regardless of now', () => {
  const pinned = [
    '--authors',
    'a',
    '--since',
    '2026-11-09',
    '--until',
    '2026-11-16',
  ]
  assert.deepEqual(parseArgs(pinned, NOW), parseArgs(pinned, NOW + 5e8))
  assert.equal(parseArgs(pinned, NOW).since, '2026-11-09')
})

test('parseArgs: rejects invalid options before any query', () => {
  const bad = [
    [[], /--authors/],
    [['--authors'], /needs a value/],
    [['--authors', 'a', '--out'], /needs a value/],
    [['--authors', 'a', '--out', '--days'], /needs a value/],
    [['--authors', ','], /empty/],
    [['--authors', 'a b'], /Not a GitHub login/],
    [['--authors', 'a', '--chunk', '0'], /positive integer/],
    [['--authors', 'a', '--chunk', '-3'], /positive integer/],
    [['--authors', 'a', '--chunk', '1.5'], /positive integer/],
    [['--authors', 'a', '--chunk', 'NaN'], /positive integer/],
    [['--authors', 'a', '--days', '0'], /positive integer/],
    [['--authors', 'a', '--since', '2026-13-01'], /calendar date|YYYY/],
    [['--authors', 'a', '--since', '2026-02-30'], /calendar date/],
    [['--authors', 'a', '--since', '11/09/2026'], /YYYY-MM-DD/],
    [
      ['--authors', 'a', '--since', '2026-11-17', '--until', '2026-11-10'],
      /after/,
    ],
    [['--authors', 'a', '--repo', 'next.js'], /owner/],
    [['--authors', 'a', '--authors', 'b'], /more than once/],
    [['--bogus', 'x'], /Unknown argument/],
  ]
  for (const [argv, re] of bad) {
    assert.throws(() => parseArgs(argv, NOW), re, JSON.stringify(argv))
  }
})

test('searchArgs: both window ends go into the query', () => {
  const merged = searchArgs('o/r', 'a', 'merged', '2026-11-09', '2026-11-16')
  assert.deepEqual(merged.slice(0, 8), [
    'search',
    'prs',
    '--repo',
    'o/r',
    '--author',
    'a',
    '--merged-at',
    '2026-11-09..2026-11-16',
  ])
  const open = searchArgs('o/r', 'a', 'open', '2026-11-09', '2026-11-16')
  assert.deepEqual(open.slice(6, 10), [
    '--state',
    'open',
    '--updated',
    '2026-11-09..2026-11-16',
  ])
})

test('collectPrs: statuses, dedupe and sorting', () => {
  const args = parseArgs(['--authors', 'b,a'], NOW)
  const calls = []
  const responses = {
    'b merged': [pr(5, 'b', { body: 'wall 10 s → 8 s' })],
    'b open': [pr(7, 'b', { isDraft: true })],
    'a merged': [pr(3, 'a')],
    'a open': [pr(2, 'a'), pr(3, 'a')],
  }
  const prs = collectPrs(args, (ghArgs) => {
    const author = ghArgs[ghArgs.indexOf('--author') + 1]
    const kind = ghArgs.includes('--merged-at') ? 'merged' : 'open'
    calls.push(`${author} ${kind}`)
    return JSON.stringify(responses[`${author} ${kind}`])
  })
  assert.deepEqual(calls, ['b merged', 'b open', 'a merged', 'a open'])
  assert.deepEqual(
    prs.map((p) => [p.number, p.author, p.status, p.hasNumbers, p.title]),
    [
      [2, 'a', 'open', false, 'PR 2'],
      [3, 'a', 'open', false, 'PR 3'],
      [5, 'b', 'merged', true, 'PR 5'],
      [7, 'b', 'draft', false, 'PR 7'],
    ]
  )
})

test('collectPrs: fails when a search hits the result cap', () => {
  const args = parseArgs(['--authors', 'a'], NOW)
  const full = Array.from({ length: SEARCH_CAP }, (_, i) => pr(i + 1, 'a'))
  assert.throws(() => collectPrs(args, () => JSON.stringify(full)), /cap/)
})

test('prepareOutDir: never deletes existing files', () => {
  const dir = tmpDir()
  const keep = path.join(dir, 'keep.txt')
  fs.writeFileSync(keep, 'important')
  assert.throws(() => prepareOutDir(dir), /not empty/)
  assert.equal(fs.readFileSync(keep, 'utf8'), 'important')

  assert.throws(() => prepareOutDir(keep), /not a directory/)
  assert.equal(fs.readFileSync(keep, 'utf8'), 'important')

  const empty = path.join(dir, 'empty')
  fs.mkdirSync(empty)
  assert.equal(prepareOutDir(empty), empty)
  const fresh = path.join(dir, 'new', 'nested')
  assert.equal(prepareOutDir(fresh), fresh)
  assert.ok(fs.statSync(fresh).isDirectory())

  const auto = prepareOutDir(null)
  assert.deepEqual(fs.readdirSync(auto), [])
  fs.rmSync(dir, { recursive: true })
  fs.rmSync(auto, { recursive: true })
})

test('writeOutput: writes window, counts, index and chunks', () => {
  const args = parseArgs(
    [
      '--authors',
      'a',
      '--chunk',
      '2',
      '--since',
      '2026-11-09',
      '--until',
      '2026-11-16',
    ],
    NOW
  )
  const prs = collectPrs(args, (ghArgs) =>
    JSON.stringify(
      ghArgs.includes('--merged-at')
        ? [pr(1, 'a'), pr(2, 'a')]
        : [pr(3, 'a', { isDraft: true })]
    )
  )
  const out = prepareOutDir(path.join(tmpDir(), 'out'))
  writeOutput(args, prs, out)
  const json = JSON.parse(fs.readFileSync(path.join(out, 'prs.json'), 'utf8'))
  assert.deepEqual(json.window, { since: '2026-11-09', until: '2026-11-16' })
  assert.deepEqual(json.counts, { merged: 2, open: 0, draft: 1 })
  const index = fs.readFileSync(path.join(out, 'index.md'), 'utf8')
  assert.match(index, /Window: 2026-11-09 to 2026-11-16/)
  assert.match(index, /Totals: 2 merged, 0 open, 1 draft/)
  assert.deepEqual(fs.readdirSync(path.join(out, 'bodies')), ['01.md', '02.md'])
  fs.rmSync(path.dirname(out), { recursive: true })
})
