#!/usr/bin/env node
// Canonical store for all bench data: one SQLite file holding raw
// measurements and artifacts, written only by this importer — no
// derived statistics, no hand-entered numbers. The per-VM JSONL files
// in a run dir are the wire format; importing is idempotent (a run
// re-imports as a whole). Stats are a pure function of this DB
// (bench-analyze.mjs reads it and nothing else).
//
//   node bench-db.mjs import <runDir...>
//   node bench-db.mjs verify [runId]
//   node bench-db.mjs export <out.db> <runId...>
//   node bench-db.mjs ls
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { loadConfig } from './config.mjs'

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS runs(
  run_id      TEXT PRIMARY KEY,
  label       TEXT,
  kind        TEXT,
  started_at  TEXT,
  imported_at TEXT NOT NULL,
  harness_sha TEXT,
  meta        TEXT
);
CREATE TABLE IF NOT EXISTS samples(
  sample_id   INTEGER PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  boot        INTEGER NOT NULL,
  arm         TEXT NOT NULL,
  block       INTEGER NOT NULL,
  run         INTEGER NOT NULL,
  route       TEXT NOT NULL,
  phase       TEXT NOT NULL,
  fingerprint TEXT,
  version     TEXT,
  cpu         TEXT,
  errors      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(run_id, boot, arm, block, run, route, phase)
);
CREATE TABLE IF NOT EXISTS measurements(
  sample_id   INTEGER NOT NULL REFERENCES samples(sample_id) ON DELETE CASCADE,
  metric      TEXT NOT NULL,
  value       REAL NOT NULL,
  UNIQUE(sample_id, metric)
);
CREATE TABLE IF NOT EXISTS artifacts(
  artifact_id INTEGER PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  boot        INTEGER,
  arm         TEXT,
  name        TEXT NOT NULL,
  kind        TEXT,
  sha256      TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  data        BLOB NOT NULL,
  UNIQUE(run_id, boot, arm, name)
);
CREATE TABLE IF NOT EXISTS boots(
  run_id  TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  boot    INTEGER NOT NULL,
  vm_name TEXT,
  UNIQUE(run_id, boot)
);
CREATE TABLE IF NOT EXISTS source_files(
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  name   TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  rows   INTEGER NOT NULL,
  UNIQUE(run_id, name)
);
CREATE INDEX IF NOT EXISTS idx_samples_run ON samples(run_id);
CREATE INDEX IF NOT EXISTS idx_measurements_sample ON measurements(sample_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);
`

// Row fields that identify a sample; every OTHER numeric field in a
// JSONL row is a measurement. New metrics therefore need no schema or
// importer change.
const IDENT = new Set([
  'vm',
  'arm',
  'block',
  'run',
  'route',
  'phase',
  'fp',
  'ver',
  'cpu',
  'errors',
  'payload',
  'round',
])

export function dbPath() {
  return path.join(loadConfig({ requireScope: false }).cacheDir, 'results.db')
}

export function openDb(file = dbPath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec(SCHEMA)
  return db
}

function harnessSha() {
  try {
    return execFileSync(
      'git',
      [
        '-C',
        path.dirname(new URL(import.meta.url).pathname),
        'rev-parse',
        'HEAD',
      ],
      { encoding: 'utf8' }
    ).trim()
  } catch {
    return null
  }
}

function artifactKind(name) {
  if (name.endsWith('.cpuprofile')) return 'cpuprofile'
  if (name.endsWith('.json')) return 'json'
  if (name.endsWith('.log') || name.endsWith('.txt')) return 'log'
  return 'file'
}

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.isFile()) out.push(p)
  }
  return out
}

// Import one run dir: replaces the run's rows wholesale so re-imports
// (recovery, added boots, new artifacts) converge on the same state.
// A re-import that would SHRINK a run (fewer boots or samples than the
// db already holds — e.g. a cleaned-up run dir) is refused without
// force: claims must never silently lose data underneath them.
export function importRun(db, dir, { force = false } = {}) {
  const runId = path.basename(path.resolve(dir))
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^results-vm\d+\.jsonl$/.test(f))
    .sort()
    .map((f) => path.join(dir, f))
  if (files.length === 0) throw new Error(`no results-vm*.jsonl in ${dir}`)
  const readJson = (f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    } catch {
      return null
    }
  }
  const meta = readJson('meta.json')
  const status = readJson('status.json')
  const prev = db
    .prepare(
      'SELECT COUNT(DISTINCT boot) boots, COUNT(*) n FROM samples WHERE run_id = ?'
    )
    .get(runId)
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM runs WHERE run_id = ?').run(runId)
    let kind = 'e2e'
    const insSample = db.prepare(`INSERT INTO samples
      (run_id, boot, arm, block, run, route, phase, fingerprint, version, cpu, errors)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    const insMeas = db.prepare(
      'INSERT INTO measurements (sample_id, metric, value) VALUES (?,?,?)'
    )
    let samples = 0
    let pendingRows = []
    const fileInfos = []
    for (const [boot, file] of files.entries()) {
      const content = fs.readFileSync(file, 'utf8')
      let fileRows = 0
      for (const line of content.trim().split('\n')) {
        if (!line) continue
        const row = JSON.parse(line)
        const micro = row.payload !== undefined
        if (micro) kind = 'micro'
        pendingRows.push({ boot, row, micro })
        fileRows++
      }
      fileInfos.push({
        boot,
        name: path.basename(file),
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
        rows: fileRows,
      })
    }
    if (
      !force &&
      prev.n > 0 &&
      (files.length < prev.boots || pendingRows.length < prev.n)
    ) {
      throw new Error(
        `re-import of ${runId} would shrink it ` +
          `(${prev.boots} boots/${prev.n} samples in db, ` +
          `${files.length} boots/${pendingRows.length} samples in ${dir}) — ` +
          'pass --force only if the db copy is known bad'
      )
    }
    db.prepare(
      `INSERT INTO runs
      (run_id, label, kind, started_at, imported_at, harness_sha, meta)
      VALUES (?,?,?,?,?,?,?)`
    ).run(
      runId,
      meta?.label ?? runId.replace(/^run-/, '').replace(/-[a-z0-9]+$/, ''),
      kind,
      status?.startedAt ?? null,
      new Date().toISOString(),
      harnessSha(),
      meta ? JSON.stringify(meta) : null
    )
    // Provenance: which sandbox VM produced each boot (from
    // status.json, matched by the index in the VM name), and the exact
    // bytes each boot's JSONL contributed.
    const vmByIndex = new Map()
    for (const name of Object.keys(status?.vms ?? {})) {
      const idx = name.match(/-(\d+)-[a-z0-9]+$/)?.[1]
      if (idx !== undefined) vmByIndex.set(Number(idx), name)
    }
    const insBoot = db.prepare(
      'INSERT INTO boots (run_id, boot, vm_name) VALUES (?,?,?)'
    )
    const insFile = db.prepare(
      'INSERT INTO source_files (run_id, name, sha256, rows) VALUES (?,?,?,?)'
    )
    for (const f of fileInfos) {
      const n = Number(f.name.match(/^results-vm(\d+)\.jsonl$/)?.[1])
      insBoot.run(runId, f.boot, vmByIndex.get(n) ?? null)
      insFile.run(runId, f.name, f.sha256, f.rows)
    }
    for (const { boot, row, micro } of pendingRows) {
      const { lastInsertRowid: sid } = insSample.run(
        runId,
        boot,
        row.arm,
        micro ? 0 : (row.block ?? 0),
        micro ? (row.round ?? 0) : (row.run ?? 0),
        micro ? '' : (row.route ?? ''),
        micro ? row.payload : row.phase,
        row.fp ?? null,
        row.ver ?? null,
        row.cpu ?? null,
        row.errors ?? 0
      )
      samples++
      for (const [k, v] of Object.entries(row)) {
        if (IDENT.has(k)) continue
        if (typeof v !== 'number' || !Number.isFinite(v)) continue
        insMeas.run(sid, k, v)
      }
    }
    // Artifacts: everything under prof-vm<N>/ (CPU profiles etc.),
    // stored gzipped with the sha256 of the RAW content.
    const insArt = db.prepare(`INSERT INTO artifacts
      (run_id, boot, arm, name, kind, sha256, bytes, data) VALUES (?,?,?,?,?,?,?,?)`)
    let artifacts = 0
    for (const e of fs.readdirSync(dir)) {
      const m = e.match(/^prof-vm(\d+)$/)
      if (!m) continue
      const boot = Number(m[1])
      for (const f of walk(path.join(dir, e))) {
        const rel = path.relative(path.join(dir, e), f)
        const arm = rel.match(/^prof-([^/]+)\//)?.[1] ?? null
        const raw = fs.readFileSync(f)
        insArt.run(
          runId,
          boot,
          arm,
          rel,
          artifactKind(rel),
          crypto.createHash('sha256').update(raw).digest('hex'),
          raw.length,
          zlib.gzipSync(raw)
        )
        artifacts++
      }
    }
    db.exec('COMMIT')
    return { runId, boots: files.length, samples, artifacts }
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

// Rows for bench-stats.analyzeE2eRows, reconstructed from the DB —
// the stats layer never reads run dirs.
export function loadRows(db, runId) {
  const samples = db
    .prepare('SELECT * FROM samples WHERE run_id = ?')
    .all(runId)
  if (samples.length === 0) throw new Error(`no samples for run ${runId}`)
  const meas = db
    .prepare(
      `SELECT m.sample_id, m.metric, m.value FROM measurements m
    JOIN samples s ON s.sample_id = m.sample_id WHERE s.run_id = ?`
    )
    .all(runId)
  const byId = new Map()
  for (const s of samples) {
    byId.set(s.sample_id, {
      vm: Number(s.boot),
      arm: s.arm,
      block: Number(s.block),
      run: Number(s.run),
      route: s.route,
      phase: s.phase,
      fp: s.fingerprint,
      ver: s.version,
      errors: Number(s.errors),
    })
  }
  for (const m of meas) byId.get(m.sample_id)[m.metric] = m.value
  return [...byId.values()]
}

export function runMeta(db, runId) {
  const r = db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId)
  return r ? { ...r, meta: r.meta ? JSON.parse(r.meta) : null } : null
}

// Integrity checks. Everything here is mechanical: SQLite-level
// integrity, referential health, per-run shape (one fingerprint per
// arm, paired sample counts), and artifact hashes. Failures are
// data-integrity violations; notes are true facts a reader must not
// gloss over (e.g. a recovered run that is legitimately partial).
export function verify(db, runId) {
  const problems = []
  const notes = []
  const ic = db.prepare('PRAGMA integrity_check').all()
  if (!(ic.length === 1 && ic[0].integrity_check === 'ok')) {
    problems.push(`sqlite integrity_check: ${JSON.stringify(ic)}`)
  }
  const fk = db.prepare('PRAGMA foreign_key_check').all()
  if (fk.length > 0) problems.push(`foreign_key_check: ${fk.length} violations`)
  const runs = runId
    ? db.prepare('SELECT run_id FROM runs WHERE run_id = ?').all(runId)
    : db.prepare('SELECT run_id FROM runs').all()
  if (runId && runs.length === 0) problems.push(`run ${runId} not in db`)
  for (const { run_id } of runs) {
    const orphanSamples = db
      .prepare(
        `SELECT COUNT(*) c FROM samples s
      WHERE s.run_id = ? AND NOT EXISTS
      (SELECT 1 FROM measurements m WHERE m.sample_id = s.sample_id)`
      )
      .get(run_id).c
    if (orphanSamples > 0) {
      problems.push(`${run_id}: ${orphanSamples} samples with no measurements`)
    }
    const arms = db
      .prepare(
        `SELECT arm, COUNT(DISTINCT COALESCE(fingerprint,'') ||
      '/' || COALESCE(version,'')) fps, COUNT(*) n
      FROM samples WHERE run_id = ? GROUP BY arm`
      )
      .all(run_id)
    if (arms.length !== 2) {
      problems.push(`${run_id}: expected 2 arms, found ${arms.length}`)
    }
    for (const a of arms) {
      if (a.fps > 1) {
        problems.push(
          `${run_id}: arm ${a.arm} has ${a.fps} distinct fingerprints`
        )
      }
    }
    const planned = (() => {
      try {
        return JSON.parse(
          db.prepare('SELECT meta FROM runs WHERE run_id = ?').get(run_id).meta
        ).vms
      } catch {
        return undefined
      }
    })()
    const gotBoots = db
      .prepare('SELECT COUNT(DISTINCT boot) c FROM samples WHERE run_id = ?')
      .get(run_id).c
    if (planned && gotBoots < planned) {
      notes.push(`${run_id}: partial run (${gotBoots}/${planned} boots)`)
    }
    if (arms.length === 2 && arms[0].n !== arms[1].n) {
      problems.push(
        `${run_id}: unpaired sample counts ` +
          `(${arms[0].arm}=${arms[0].n} vs ${arms[1].arm}=${arms[1].n})`
      )
    }
    for (const art of db
      .prepare(
        'SELECT artifact_id, name, sha256, bytes, data FROM artifacts WHERE run_id = ?'
      )
      .all(run_id)) {
      const raw = zlib.gunzipSync(art.data)
      if (
        raw.length !== Number(art.bytes) ||
        crypto.createHash('sha256').update(raw).digest('hex') !== art.sha256
      ) {
        problems.push(`${run_id}: artifact ${art.name} fails hash/size check`)
      }
    }
  }
  return { failures: problems, notes }
}

export function exportRuns(db, outFile, runIds) {
  fs.rmSync(outFile, { force: true })
  const out = openDb(outFile)
  const copy = (table, cols) => {
    const ins = out.prepare(`INSERT INTO ${table} (${cols.join(',')})
      VALUES (${cols.map(() => '?').join(',')})`)
    return (row) => ins.run(...cols.map((c) => row[c]))
  }
  out.exec('BEGIN')
  const copyRun = copy('runs', [
    'run_id',
    'label',
    'kind',
    'started_at',
    'imported_at',
    'harness_sha',
    'meta',
  ])
  const copySample = copy('samples', [
    'sample_id',
    'run_id',
    'boot',
    'arm',
    'block',
    'run',
    'route',
    'phase',
    'fingerprint',
    'version',
    'cpu',
    'errors',
  ])
  const copyMeas = copy('measurements', ['sample_id', 'metric', 'value'])
  const copyBoot = copy('boots', ['run_id', 'boot', 'vm_name'])
  const copyFile = copy('source_files', ['run_id', 'name', 'sha256', 'rows'])
  const copyArt = copy('artifacts', [
    'run_id',
    'boot',
    'arm',
    'name',
    'kind',
    'sha256',
    'bytes',
    'data',
  ])
  for (const runId of runIds) {
    const run = db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId)
    if (!run) throw new Error(`run ${runId} not in db`)
    copyRun(run)
    for (const s of db
      .prepare('SELECT * FROM samples WHERE run_id = ?')
      .all(runId)) {
      copySample(s)
      for (const m of db
        .prepare('SELECT * FROM measurements WHERE sample_id = ?')
        .all(s.sample_id)) {
        copyMeas(m)
      }
    }
    for (const a of db
      .prepare('SELECT * FROM artifacts WHERE run_id = ?')
      .all(runId)) {
      copyArt(a)
    }
    for (const b of db
      .prepare('SELECT * FROM boots WHERE run_id = ?')
      .all(runId)) {
      copyBoot(b)
    }
    for (const f of db
      .prepare('SELECT * FROM source_files WHERE run_id = ?')
      .all(runId)) {
      copyFile(f)
    }
  }
  out.exec('COMMIT')
  out.close()
}

// ------------------------------------------------------------------ CLI
function isMain() {
  if (!process.argv[1]) return false
  try {
    return (
      fs.realpathSync(process.argv[1]) ===
      fs.realpathSync(new URL(import.meta.url).pathname)
    )
  } catch {
    return false
  }
}
if (isMain()) {
  const [cmd, ...rest] = process.argv.slice(2)
  const db = openDb()
  const report = ({ failures, notes }, label) => {
    for (const n of notes) console.log(`note: ${n}`)
    if (failures.length) {
      console.error(`VERIFY FAILED:\n  ${failures.join('\n  ')}`)
      process.exit(1)
    }
    console.log(`verify: ok${label ? ` (${label})` : ''}`)
  }
  if (cmd === 'import') {
    const force = rest.includes('--force')
    const dirs = rest.filter((a) => a !== '--force')
    if (dirs.length === 0) {
      console.error('usage: bench-db.mjs import [--force] <runDir...>')
      process.exit(1)
    }
    for (const dir of dirs) {
      let r
      try {
        r = importRun(db, dir, { force })
      } catch (e) {
        console.error(`IMPORT REFUSED: ${e.message}`)
        process.exit(1)
      }
      console.log(
        `${r.runId}: ${r.boots} boots, ${r.samples} samples, ${r.artifacts} artifacts`
      )
    }
    report(verify(db))
  } else if (cmd === 'verify') {
    report(verify(db, rest[0]), rest[0] ?? 'all runs')
  } else if (cmd === 'export') {
    const [out, ...ids] = rest
    if (!out || ids.length === 0) {
      console.error('usage: bench-db.mjs export <out.db> <runId...>')
      process.exit(1)
    }
    exportRuns(db, out, ids)
    console.log(`${out}: ${ids.length} runs`)
  } else if (cmd === 'ls') {
    for (const r of db
      .prepare(
        `SELECT r.run_id, r.kind, r.started_at,
      (SELECT COUNT(DISTINCT boot) FROM samples s WHERE s.run_id = r.run_id) boots,
      (SELECT COUNT(*) FROM samples s WHERE s.run_id = r.run_id) samples,
      (SELECT COUNT(*) FROM artifacts a WHERE a.run_id = r.run_id) artifacts
      FROM runs r ORDER BY r.started_at`
      )
      .all()) {
      console.log(
        `${r.run_id}  ${r.kind}  boots=${r.boots} samples=${r.samples} artifacts=${r.artifacts}  ${r.started_at ?? ''}`
      )
    }
  } else {
    console.error('usage: bench-db.mjs import|verify|export|ls')
    process.exit(1)
  }
}
