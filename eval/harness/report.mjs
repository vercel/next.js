#!/usr/bin/env node
// Aggregates per-run scores under a results dir into comparison tables.
// Usage: node report.mjs <resultsDir> [arm1 arm2 ...]
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node report.mjs <resultsDir> [arms...]')
  process.exit(1)
}
const arms = process.argv.slice(3)
const armDirs = arms.length
  ? arms
  : fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'results.jsonl')))

function load(arm) {
  const lines = fs
    .readFileSync(path.join(dir, arm, 'results.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
  return lines
}

const pct = (x, n) => `${Math.round((100 * x) / n)}%`
const pad = (s, w) => String(s).padEnd(w)
const padL = (s, w) => String(s).padStart(w)

const rows = []
for (const arm of armDirs) {
  const r = load(arm)
  const n = r.length
  const count = (f) => r.filter(f).length
  rows.push({
    arm,
    n,
    adapted: count((x) => x.adapted),
    solved: count((x) => x.solved),
    browser: count((x) => x.method === 'browser'),
    apiSpoof: count((x) => x.method === 'api-spoof'),
    source: count((x) => x.method === 'source'),
    other: count((x) => x.method === 'other'),
    failed: count((x) => x.method === 'failed'),
    piReject: count((x) => x.promptInjectionReject),
    avgCurl: (r.reduce((a, x) => a + x.nCurl, 0) / n).toFixed(1),
    avgTurns: (r.reduce((a, x) => a + (x.numTurns || 0), 0) / n).toFixed(1),
    avgSec: (r.reduce((a, x) => a + (x.durMs || 0), 0) / n / 1000).toFixed(0),
  })
}

// Headline: adaptation (used browser tool) + solved
console.log('\n### Adaptation & outcome\n')
const h1 = ['arm', 'n', 'adapted(browser)', 'solved', 'prompt-inj reject', 'avg curls']
const w1 = [12, 3, 18, 10, 18, 10]
console.log('| ' + h1.map((h, i) => pad(h, w1[i])).join(' | ') + ' |')
console.log('|' + w1.map((w) => '-'.repeat(w + 2)).join('|') + '|')
for (const r of rows) {
  const cells = [
    pad(r.arm, w1[0]),
    padL(r.n, w1[1]),
    pad(`${r.adapted}/${r.n} (${pct(r.adapted, r.n)})`, w1[2]),
    pad(`${r.solved}/${r.n} (${pct(r.solved, r.n)})`, w1[3]),
    pad(`${r.piReject}/${r.n} (${pct(r.piReject, r.n)})`, w1[4]),
    padL(r.avgCurl, w1[5]),
  ]
  console.log('| ' + cells.join(' | ') + ' |')
}

// Method breakdown (how the agent got the answer)
console.log('\n### How the answer was obtained (method breakdown, counts)\n')
const h2 = ['arm', 'browser', 'api-spoof', 'source', 'other', 'failed']
const w2 = [12, 8, 10, 7, 6, 7]
console.log('| ' + h2.map((h, i) => pad(h, w2[i])).join(' | ') + ' |')
console.log('|' + w2.map((w) => '-'.repeat(w + 2)).join('|') + '|')
for (const r of rows) {
  const cells = [
    pad(r.arm, w2[0]),
    padL(r.browser, w2[1]),
    padL(r.apiSpoof, w2[2]),
    padL(r.source, w2[3]),
    padL(r.other, w2[4]),
    padL(r.failed, w2[5]),
  ]
  console.log('| ' + cells.join(' | ') + ' |')
}
console.log(
  '\nmethod = browser (used next-browser, the intended tool) · api-spoof (curled the KPI API with a spoofed browser UA) · source (read app source off disk) · other (reported number, unclear path) · failed (never reported the figure)\n'
)
