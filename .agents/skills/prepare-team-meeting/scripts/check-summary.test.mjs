// Offline tests for check-summary.mjs. Run with:
//   node --test .agents/skills/prepare-team-meeting/scripts/check-summary.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkSummary } from './check-summary.mjs'

const url = (n) => `https://github.com/vercel/next.js/pull/${n}`
const link = (n) => `[#${n}](${url(n)})`
const data = {
  prs: [
    { number: 1, author: 'a', status: 'merged', url: url(1), hasNumbers: true },
    { number: 2, author: 'a', status: 'draft', url: url(2), hasNumbers: true },
    { number: 3, author: 'b', status: 'open', url: url(3), hasNumbers: false },
  ],
}
const good = [
  '# Team PRs: 2026-11-10–2026-11-17',
  '',
  '- **Dev server** (@a)',
  `  - ✅ 💥 Something user-visible ${link(1)}`,
  `    - 📊 ${link(1)}: −10% wall`,
  `  - 📝 Internal cleanup ${link(2)}`,
  '- **Images** (@b)',
  `  - 🔄 New option ${link(3)}`,
  '    - ❓ Should the option default to on?',
  '',
].join('\n')

test('accepts a valid document and warns about missing 📊 lines', () => {
  const r = checkSummary(data, good)
  assert.deepEqual(r.errors, [])
  assert.equal(r.covered, 3)
  assert.equal(r.warnings.length, 1)
  assert.match(r.warnings[0], /#2/)
})

test('reports missing PRs, wrong status, wrong owner and bad links', () => {
  const doc = [
    '- **Dev server** (@b)',
    `  - 🔄 Something ${link(1)}`,
    `  - ✅ Other [#9](${url(9)}) [#3](https://example.com/3)`,
  ].join('\n')
  const { errors } = checkSummary(data, doc)
  const text = errors.join('\n')
  assert.match(text, /#1 is merged, flagged 🔄/)
  assert.match(text, /#1 is by @a, listed under @b/)
  assert.match(text, /#9 is not in prs.json/)
  assert.match(text, /#3 links to https:\/\/example.com\/3/)
  assert.match(text, /#2 .* is missing/)
})

test('rejects numbered headings and categories without an owner', () => {
  const doc = [
    '## 1. Dev server: @a',
    '- **Dev server**',
    `  - ✅ x ${link(1)}`,
  ].join('\n')
  const text = checkSummary(data, doc).errors.join('\n')
  assert.match(text, /line 1: use a top-level/)
  assert.match(text, /line 2: top-level items must be/)
  assert.match(text, /line 3: PR item outside of a category/)
})

test('allows two owners and enforces the line limit', () => {
  const doc = [
    '- **Shared** (@a, @b)',
    `  - ✅ x ${link(1)}`,
    `  - 📝 y ${link(2)}`,
    `  - 🔄 z ${link(3)}`,
  ].join('\n')
  assert.deepEqual(checkSummary(data, doc).errors, [])
  assert.match(
    checkSummary(data, doc, { maxLines: 3 }).errors.join('\n'),
    /4 lines, the limit is 3/
  )
})
