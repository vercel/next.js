// Offline tests for check-summary.mjs. Run with:
//   node --test .agents/skills/prepare-team-meeting/scripts/check-summary.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkSummary, parseArgs } from './check-summary.mjs'

const SCRIPT = fileURLToPath(new URL('./check-summary.mjs', import.meta.url))
const url = (n) => `https://github.com/vercel/next.js/pull/${n}`
const link = (n) => `[#${n}](${url(n)})`
const data = {
  window: { since: '2026-11-10', until: '2026-11-17' },
  prs: [
    { number: 1, author: 'a', status: 'merged', url: url(1), hasNumbers: true },
    { number: 2, author: 'a', status: 'draft', url: url(2), hasNumbers: true },
    { number: 3, author: 'b', status: 'open', url: url(3), hasNumbers: false },
    { number: 4, author: 'b', status: 'merged', url: url(4), hasNumbers: true },
  ],
}
const HEADER = [
  '# Team PRs: 2026-11-10–2026-11-17',
  '',
  'Legend: ✅ merged · 🔄 open · 📝 draft · 💥 breaking · ❓ decision needed · ☑️ decided · 📊 benchmark',
  '**Totals:** 2 ✅ · 1 🔄 · 1 📝',
  '',
]
const doc = (...body) => [...HEADER, ...body, ''].join('\n')

// A complete document with every kind of entry.
const good = doc(
  '- **Config** (@b)',
  `  - 🔄 💥 Removes the deprecated \`foo\` option; use \`bar\` instead ${link(3)}`,
  '    - ❓ Ship in the next minor, or wait for the major?',
  `  - ✅ New \`baz\` option ${link(4)}`,
  '    - ☑️ Off by default, as agreed in review',
  `    - 📊 ${link(4)}: −10% build time (large app, cold; stacked on [#900](${url(900)}))`,
  '- **Dev server** (@a)',
  `  - ✅ Faster startup ${link(1)}`,
  `    - 📊 #1: warm start 261 → 213 ms`,
  `  - 📝 Internal: cache cleanup ${link(2)}`
)

test('accepts a complete document and warns about missing 📊 lines', () => {
  const r = checkSummary(data, good)
  assert.deepEqual(r.errors, [])
  assert.equal(r.covered, 4)
  assert.deepEqual(r.warnings.length, 1)
  assert.match(r.warnings[0], /^#2:/)
})

test('reports missing PRs, wrong status, wrong owner, duplicates and bad links', () => {
  const text = checkSummary(
    data,
    doc(
      '- **Dev server** (@b)',
      `  - 🔄 Something ${link(1)}`,
      `  - ✅ Other [#9](${url(9)}) [#4](https://example.com/4)`,
      `  - ✅ Again ${link(4)}`
    )
  ).errors.join('\n')
  assert.match(text, /#1 is merged, flagged 🔄/)
  assert.match(text, /#1 is by @a, listed under @b/)
  assert.match(text, /#9 is not in prs.json/)
  assert.match(text, /#4 links to https:\/\/example.com\/4/)
  assert.match(text, /#4 is listed twice/)
  assert.match(text, /#2 .* is missing/)
})

test('checks the title window and the totals', () => {
  const bad = good
    .replace('2026-11-10–2026-11-17', '2026-11-09–2026-11-16')
    .replace('**Totals:** 2 ✅', '**Totals:** 3 ✅')
  const text = checkSummary(data, bad).errors.join('\n')
  assert.match(text, /title must contain the window 2026-11-10–2026-11-17/)
  assert.match(text, /totals say 3\/1\/1, prs.json has 2\/1\/1/)
  const noTotals = good.replace(/^\*\*Totals:.*$/m, '')
  assert.match(
    checkSummary(data, noTotals).errors.join('\n'),
    /missing "\*\*Totals/
  )
})

test('rejects headings, numbered lists, stray text and bad indentation', () => {
  const text = checkSummary(
    data,
    good +
      [
        '## 1. Dev server: @a',
        '1. Other category (@b)',
        'Some paragraph',
        '- **Dev server**',
        `  - ✅ x ${link(1)}`,
        `      - too deep`,
        '  - Not a PR item',
      ].join('\n')
  ).errors.join('\n')
  assert.match(text, /use a top-level .* not a heading/)
  assert.match(text, /not numbered lists/)
  assert.match(text, /text outside of a list item/)
  assert.match(text, /top-level items must be/)
  assert.match(text, /PR item outside of a category/)
  assert.match(text, /indented by 0, 2 or 4 spaces/)
  assert.match(text, /PR items must start with ✅, 🔄 or 📝/)
})

test('details must belong to a PR item and benchmarks to its PRs', () => {
  const r = checkSummary(
    data,
    doc(
      '    - 📊 #1: orphan before any item',
      '- **Dev server** (@a)',
      '    - 📊 #1: orphan before any item in the category',
      `  - ✅ Faster startup ${link(1)}`,
      `    - 📊 #2: belongs to another item`,
      `    - 📊 [#1](https://example.com/1): wrong URL`,
      '    - 📊 no PR number',
      `  - 📝 Internal ${link(2)}`,
      '- **Config** (@b)',
      `  - 🔄 x ${link(3)}`,
      `  - ✅ y ${link(4)}`
    )
  )
  const text = r.errors.join('\n')
  assert.equal(text.match(/detail line without a PR item/g).length, 2)
  assert.match(text, /📊 #2 is not one of the PRs in the item above/)
  assert.match(text, /#1 links to https:\/\/example.com\/1/)
  assert.match(text, /📊 lines must start with the PR number/)
  // The misplaced benchmarks don't count, so #2 and #4 are still warned about.
  assert.deepEqual(
    r.warnings.map((w) => w.split(':')[0]),
    ['#2', '#4']
  )
})

test('allows two owners and enforces a valid line limit', () => {
  const shared = doc(
    '- **Shared** (@a, @b)',
    `  - ✅ x ${link(1)} ${link(4)}`,
    `  - 📝 y ${link(2)}`,
    `  - 🔄 z ${link(3)}`
  )
  assert.deepEqual(checkSummary(data, shared).errors, [])
  assert.match(
    checkSummary(data, shared, { maxLines: 5 }).errors.join('\n'),
    /9 lines, the limit is 5/
  )
  for (const maxLines of [NaN, 0, -1, 1.5, 201]) {
    assert.throws(() => checkSummary(data, shared, { maxLines }), /maxLines/)
  }
})

test('parseArgs validates the command line', () => {
  assert.deepEqual(parseArgs(['--prs', 'p.json', '--doc', 'd.md']), {
    prs: 'p.json',
    doc: 'd.md',
    maxLines: 200,
  })
  const bad = [
    [['--prs', 'p.json'], /Pass --prs and --doc/],
    [['--prs'], /needs a value/],
    [['--prs', '--doc', 'd.md'], /needs a value/],
    [['--prs', 'a', '--prs', 'b', '--doc', 'd'], /more than once/],
    [
      ['--prs', 'a', '--doc', 'd', '--max-lines', 'garbage'],
      /positive integer/,
    ],
    [['--bogus', 'x'], /Unknown argument/],
  ]
  for (const [argv, re] of bad) assert.throws(() => parseArgs(argv), re)
})

test('CLI: --help, exit codes and invalid limits', () => {
  const run = (...args) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
  const help = run('--help')
  assert.equal(help.status, 0)
  assert.match(help.stdout, /^Usage: node check-summary.mjs/)

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-summary-test-'))
  const prsPath = path.join(dir, 'prs.json')
  const docPath = path.join(dir, 'summary.md')
  fs.writeFileSync(prsPath, JSON.stringify(data))
  fs.writeFileSync(docPath, good)
  const ok = run('--prs', prsPath, '--doc', docPath)
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /4\/4 PRs covered, \d+ lines, 0 errors, 1 warnings/)

  fs.writeFileSync(docPath, good.replace(`${link(3)}`, ''))
  assert.equal(run('--prs', prsPath, '--doc', docPath).status, 1)
  const limit = run('--prs', prsPath, '--doc', docPath, '--max-lines', '500')
  assert.equal(limit.status, 2)
  assert.match(limit.stderr, /maxLines must be an integer from 1 to 200/)
  fs.rmSync(dir, { recursive: true })
})
