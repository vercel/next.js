#!/usr/bin/env node
// Post-hoc (re-)analysis of sandbox-e2e run dirs at the boot level.
// Works on any past or future run without re-running it:
//   node bench-analyze.mjs <runDir> [--base <arm>] [--cand <arm>]
// A run dir is .cache/sandbox-e2e/run-<label>-*/ with results-vm*.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import {analyzeE2eRows} from './bench-stats.mjs';

const argv = process.argv.slice(2);
const dir = argv.find(a => !a.startsWith('--'));
const get = name => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (!dir) {
  console.error('usage: node bench-analyze.mjs <runDir> [--base arm] [--cand arm]');
  process.exit(1);
}
const files = fs.readdirSync(dir)
  .filter(f => /^results-vm\d+\.jsonl$/.test(f))
  .sort()
  .map(f => path.join(dir, f));
if (files.length === 0) {
  console.error(`no results-vm*.jsonl in ${dir}`);
  process.exit(1);
}
const rows = files.flatMap((f, i) =>
  // The file index is the boot id; it must win over any same-named
  // field in the row.
  fs.readFileSync(f, 'utf8').trim().split('\n').map(l => ({...JSON.parse(l), vm: i})));
const arms = [...new Set(rows.map(r => r.arm))];
if (arms.length !== 2) {
  console.error(`expected exactly 2 arms in rows, found: ${arms.join(', ')}`);
  process.exit(1);
}
// Which arm is base? Row order cannot answer this (ABBA runs the
// candidate first), so require an explicit source: the run's meta.json,
// a conventional name, or the --base flag.
const metaFile = path.join(dir, 'meta.json');
const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : null;
const base = get('--base') ??
  (meta && arms.includes(meta.base) ? meta.base : undefined) ??
  ['base', 'synced'].find(n => arms.includes(n));
if (!base) {
  console.error(`cannot determine the base arm from {${arms.join(', ')}}: ` +
    'no meta.json, no arm named "base"/"synced" — pass --base <arm>');
  process.exit(1);
}
const cand = get('--cand') ?? arms.find(a => a !== base);
console.log(`${dir}  boots=${files.length}  arms: ${base} (base) vs ${cand}`);
if (meta?.pr) console.log(`PR: ${meta.pr.title ? `"${meta.pr.title}" — ` : ''}${meta.pr.url}`);
for (const a of meta?.arms ?? []) if (a.title) console.log(`  ${a.name}: "${a.title}"`);
if (rows[0].payload !== undefined) {
  // Micro (sandbox-ab) rows: {vm, arm, round, payload, metrics...}.
  // Pivot them into the e2e shape (phase <- payload, run <- round).
  const pivoted = rows.map(r => ({
    ...r, route: '', phase: r.payload, block: 0, run: r.round,
  }));
  analyzeE2eRows(pivoted, base, cand, ['mean', 'p50', 'p95', 'p99', 'gcMs']);
} else {
  // No p99 for e2e: the load phases are far too small for it.
  analyzeE2eRows(rows, base, cand,
    ['rps', 'median', 'mean', 'p95', 'ttfb', 'docKb', 'gzipKb', 'flightKb', 'rss', 'rssHw']);
}
