import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

export const DEFAULT_SNAPSHOT_DIR = '.devlow-bench/snapshots'

// One row per (scenario, variant, metric, sample). Long-format so the same
// file can store mixed-unit metrics (ms, MB, requests, ...) without sparse
// columns. Consumers can filter by `unit` and pivot downstream.
export interface SnapshotRow {
  timestamp: string
  scenario: string
  variant: string
  metric: string
  sample_idx: number
  value: number
  unit: string
  relative_to: string
  git_sha: string
  git_branch: string
}

const COLUMNS: (keyof SnapshotRow)[] = [
  'timestamp',
  'scenario',
  'variant',
  'metric',
  'sample_idx',
  'value',
  'unit',
  'relative_to',
  'git_sha',
  'git_branch',
]

export function defaultSnapshotPath(
  dir: string = DEFAULT_SNAPSHOT_DIR,
  now: Date = new Date()
): string {
  // ISO-ish, filesystem-safe, lexicographic-sortable.
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z')
  return resolve(join(dir, `${stamp}.csv`))
}

export async function writeSnapshot(
  path: string,
  rows: SnapshotRow[]
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const lines: string[] = [COLUMNS.join(',')]
  for (const row of rows) {
    lines.push(COLUMNS.map((c) => csvCell(row[c])).join(','))
  }
  await writeFile(path, lines.join('\n') + '\n')
}

export async function readSnapshot(path: string): Promise<SnapshotRow[]> {
  const text = await readFile(path, 'utf-8')
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return []
  const header = parseCsvLine(lines[0])
  const idx: Partial<Record<keyof SnapshotRow, number>> = {}
  for (let i = 0; i < header.length; i++) {
    if ((COLUMNS as string[]).includes(header[i])) {
      idx[header[i] as keyof SnapshotRow] = i
    }
  }
  const rows: SnapshotRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const get = (k: keyof SnapshotRow): string => {
      const j = idx[k]
      return j == null ? '' : (cells[j] ?? '')
    }
    rows.push({
      timestamp: get('timestamp'),
      scenario: get('scenario'),
      variant: get('variant'),
      metric: get('metric'),
      sample_idx: Number(get('sample_idx')),
      value: Number(get('value')),
      unit: get('unit'),
      relative_to: get('relative_to'),
      git_sha: get('git_sha'),
      git_branch: get('git_branch'),
    })
  }
  return rows
}

// Returns the newest .csv in the directory, excluding the optional exclude
// path. Returns null if the directory doesn't exist or has no matching files.
export async function findMostRecentSnapshot(
  dir: string = DEFAULT_SNAPSHOT_DIR,
  excludePath?: string
): Promise<string | null> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (e: any) {
    if (e.code === 'ENOENT') return null
    throw e
  }
  const candidates = entries.filter((f) => f.endsWith('.csv'))
  const excludeResolved = excludePath ? resolve(excludePath) : null
  let best: { path: string; mtime: number } | null = null
  for (const f of candidates) {
    const full = resolve(join(dir, f))
    if (excludeResolved && full === excludeResolved) continue
    const s = await stat(full)
    if (!best || s.mtimeMs > best.mtime) {
      best = { path: full, mtime: s.mtimeMs }
    }
  }
  return best?.path ?? null
}

// Resolve --compare: if given a directory, pick the newest .csv inside;
// if given a file, use it; if null/undefined, fall back to DEFAULT_SNAPSHOT_DIR.
export async function resolveCompareTarget(
  target: string | true | undefined,
  excludePath?: string
): Promise<string | null> {
  if (target == null) return null
  let candidatePath: string | null = null
  if (target === true) {
    candidatePath = await findMostRecentSnapshot(
      DEFAULT_SNAPSHOT_DIR,
      excludePath
    )
  } else {
    let isDir = false
    try {
      isDir = (await stat(target)).isDirectory()
    } catch {
      // Path doesn't exist; let caller error out.
    }
    if (isDir) {
      candidatePath = await findMostRecentSnapshot(target, excludePath)
    } else {
      candidatePath = resolve(target)
    }
  }
  return candidatePath
}

function csvCell(v: string | number): string {
  const s = String(v)
  if (/[,"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      let s = ''
      i++ // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            s += '"'
            i += 2
          } else {
            i++ // closing quote
            break
          }
        } else {
          s += line[i]
          i++
        }
      }
      cells.push(s)
      if (line[i] === ',') i++
    } else {
      const next = line.indexOf(',', i)
      if (next === -1) {
        cells.push(line.slice(i))
        i = line.length
      } else {
        cells.push(line.slice(i, next))
        i = next + 1
      }
    }
  }
  return cells
}
