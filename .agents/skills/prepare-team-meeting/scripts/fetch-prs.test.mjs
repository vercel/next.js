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
  COMMITS_CAP,
  SEARCH_CAP,
  SKIP_REASON,
  activityArgs,
  collectPrs,
  commitsArgs,
  inWindow,
  isRebaseOnly,
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
    createdAt: '2026-11-12T10:00:00Z',
    ...extra,
  }
}

// A fake `gh`: search results by "<author> <merged|open>", commit dates by PR
// number as [authored, committed] pairs, and comment / review dates by
// "<kind> <number>" with kind issue-comments, reviews or review-comments.
// Records every call.
function fakeGh(searches, commits = {}, activity = {}) {
  const calls = []
  const run = (ghArgs) => {
    if (ghArgs[0] === 'api') {
      const [, kind, number, what] = ghArgs[2].match(
        /repos\/[^/]+\/[^/]+\/(pulls|issues)\/(\d+)\/(\w+)/
      )
      const key =
        what === 'commits'
          ? 'commits'
          : what === 'reviews'
            ? 'reviews'
            : kind === 'issues'
              ? 'issue-comments'
              : 'review-comments'
      calls.push(`${key} ${number}`)
      if (key === 'commits') {
        return (commits[number] ?? []).map((c) => c.join('\t') + '\n').join('')
      }
      return (activity[`${key} ${number}`] ?? []).map((d) => d + '\n').join('')
    }
    const author = ghArgs[ghArgs.indexOf('--author') + 1]
    const kind = ghArgs.includes('--merged-at') ? 'merged' : 'open'
    calls.push(`${author} ${kind}`)
    return JSON.stringify(searches[`${author} ${kind}`] ?? [])
  }
  return { run, calls }
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
  const gh = fakeGh({
    'b merged': [pr(5, 'b', { body: 'wall 10 s → 8 s' })],
    'b open': [pr(7, 'b', { isDraft: true })],
    'a merged': [pr(3, 'a')],
    'a open': [pr(2, 'a'), pr(3, 'a')],
  })
  const { prs, skipped } = collectPrs(args, gh.run)
  // All PRs were created in the window, so no commits are checked.
  assert.deepEqual(gh.calls, ['b merged', 'b open', 'a merged', 'a open'])
  assert.deepEqual(skipped, [])
  assert.deepEqual(
    prs.map((p) => [p.number, p.author, p.status, p.hasNumbers, p.title]),
    [
      [2, 'a', 'open', false, 'PR 2'],
      [3, 'a', 'merged', false, 'PR 3'],
      [5, 'b', 'merged', true, 'PR 5'],
      [7, 'b', 'draft', false, 'PR 7'],
    ]
  )
})

test('inWindow: whole UTC days, both ends inclusive', () => {
  const w = ['2026-11-10', '2026-11-17']
  assert.ok(inWindow('2026-11-10T00:00:00Z', ...w))
  assert.ok(inWindow('2026-11-17T23:59:59Z', ...w))
  assert.ok(!inWindow('2026-11-09T23:59:59Z', ...w))
  assert.ok(!inWindow('2026-11-18T00:00:00Z', ...w))
})

test('isRebaseOnly: only re-committed, never authored in the window', () => {
  const w = ['2026-11-10', '2026-11-17']
  const old = { createdAt: '2026-10-01T00:00:00Z' }
  const c = (authored, committed) => ({ authored, committed })
  const before = '2026-10-02T00:00:00Z'
  const during = '2026-11-15T00:00:00Z'
  // Rebase: old commits got a new committer date.
  assert.ok(isRebaseOnly(old, [c(before, during), c(before, during)], ...w))
  // A new commit was authored in the window.
  assert.ok(!isRebaseOnly(old, [c(before, during), c(during, during)], ...w))
  // No commits in the window at all: updated by a comment, review or edit.
  assert.ok(!isRebaseOnly(old, [c(before, before)], ...w))
  // Created in the window.
  assert.ok(!isRebaseOnly({ createdAt: during }, [c(before, during)], ...w))
  // GitHub lists at most COMMITS_CAP commits, so newer ones may be missing.
  const capped = Array.from({ length: COMMITS_CAP }, () => c(before, during))
  assert.ok(!isRebaseOnly(old, capped, ...w))
  assert.ok(isRebaseOnly(old, capped.slice(1), ...w))
  // An unreadable author date can't prove that nothing new was authored.
  assert.ok(!isRebaseOnly(old, [c(before, during), c('', during)], ...w))
  assert.ok(!isRebaseOnly(old, [c('garbage', during)], ...w))
})

test('activityArgs: comments, reviews and review comments of one PR', () => {
  const [issue, reviews, review] = activityArgs('o/r', 12, '2026-11-10')
  assert.equal(
    issue[2],
    'repos/o/r/issues/12/comments?per_page=100&since=2026-11-10T00:00:00Z'
  )
  assert.equal(reviews[2], 'repos/o/r/pulls/12/reviews?per_page=100')
  assert.equal(
    review[2],
    'repos/o/r/pulls/12/comments?per_page=100&since=2026-11-10T00:00:00Z'
  )
  for (const a of [issue, reviews, review]) assert.equal(a[1], '--paginate')
})

test('collectPrs: skips open PRs whose only update was a rebase', () => {
  const args = parseArgs(
    ['--authors', 'a', '--since', '2026-11-10', '--until', '2026-11-17'],
    NOW
  )
  const old = { createdAt: '2026-10-01T00:00:00Z' }
  const before = '2026-10-02T00:00:00Z'
  const during = '2026-11-15T00:00:00Z'
  const after = '2026-11-20T00:00:00Z'
  const rebased = [[before, during]]
  const gh = fakeGh(
    {
      'a merged': [pr(1, 'a', old)],
      'a open': [
        pr(2, 'a', old),
        pr(3, 'a', { ...old, isDraft: true }),
        pr(4, 'a', old),
        pr(5, 'a'),
        pr(6, 'a', old),
        pr(7, 'a', old),
        pr(8, 'a', { ...old, isDraft: true }),
        pr(9, 'a', old),
      ],
    },
    {
      2: rebased,
      3: [
        [before, during],
        [during, during],
      ],
      4: [[before, before]],
      6: rebased,
      7: rebased,
      8: rebased,
      9: rebased,
    },
    {
      // Comments edited after the window and older reviews don't count.
      'issue-comments 2': [before, after],
      'reviews 2': [before],
      'reviews 6': [during],
      'review-comments 7': [during, during],
      'issue-comments 9': [during],
    }
  )
  const { prs, skipped } = collectPrs(args, gh.run)
  // Merged PRs and PRs created in the window need no commit check, and only
  // rebased PRs need the activity checks, which stop at the first match.
  assert.deepEqual(gh.calls, [
    'a merged',
    'a open',
    'commits 2',
    'issue-comments 2',
    'reviews 2',
    'review-comments 2',
    'commits 3',
    'commits 4',
    'commits 6',
    'issue-comments 6',
    'reviews 6',
    'commits 7',
    'issue-comments 7',
    'reviews 7',
    'review-comments 7',
    'commits 8',
    'issue-comments 8',
    'reviews 8',
    'review-comments 8',
    'commits 9',
    'issue-comments 9',
  ])
  assert.deepEqual(
    prs.map((p) => [p.number, p.status]),
    [
      [1, 'merged'],
      [3, 'draft'],
      [4, 'open'],
      [5, 'open'],
      [6, 'open'],
      [7, 'open'],
      [9, 'open'],
    ]
  )
  const url = (n) => `https://github.com/vercel/next.js/pull/${n}`
  assert.deepEqual(skipped, [
    {
      number: 2,
      url: url(2),
      title: 'PR 2',
      author: 'a',
      status: 'open',
      reason: SKIP_REASON,
    },
    {
      number: 8,
      url: url(8),
      title: 'PR 8',
      author: 'a',
      status: 'draft',
      reason: SKIP_REASON,
    },
  ])
})

test('commitsArgs: paginated commit dates of one PR', () => {
  const a = commitsArgs('o/r', 12)
  assert.deepEqual(a.slice(0, 3), [
    'api',
    '--paginate',
    'repos/o/r/pulls/12/commits?per_page=100',
  ])
  assert.match(a[4], /commit\.author\.date, \.commit\.committer\.date/)
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
  const result = collectPrs(
    args,
    fakeGh({
      'a merged': [pr(1, 'a'), pr(2, 'a')],
      'a open': [pr(3, 'a', { isDraft: true })],
    }).run
  )
  result.skipped.push({
    number: 9,
    url: 'u',
    title: 'Rebased',
    author: 'a',
    status: 'open',
    reason: SKIP_REASON,
  })
  const out = prepareOutDir(path.join(tmpDir(), 'out'))
  writeOutput(args, result, out)
  const json = JSON.parse(fs.readFileSync(path.join(out, 'prs.json'), 'utf8'))
  assert.deepEqual(json.window, { since: '2026-11-09', until: '2026-11-16' })
  assert.deepEqual(json.counts, { merged: 2, open: 0, draft: 1 })
  assert.deepEqual(
    json.skipped.map((p) => p.number),
    [9]
  )
  const index = fs.readFileSync(path.join(out, 'index.md'), 'utf8')
  assert.match(index, /Window: 2026-11-09 to 2026-11-16/)
  assert.match(index, /Totals: 2 merged, 0 open, 1 draft/)
  assert.match(index, /Skipped: 1 open or draft PRs that look rebase-only/)
  assert.match(
    index,
    /## Skipped: likely rebase-only \(date heuristic\)[^\n]*\n\n- open\t#9\t@a\tRebased/
  )
  assert.deepEqual(fs.readdirSync(path.join(out, 'bodies')), ['01.md', '02.md'])
  fs.rmSync(path.dirname(out), { recursive: true })
})
