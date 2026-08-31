import * as path from 'node:path'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'

import { getGitBranch, getGitCommit, getGitDirty } from '../../lib/helpers/git'

/**
 * Maximum number of historical snapshots to keep on disk by default. When the
 * history exceeds this number, the oldest snapshots are pruned.
 */
const MAX_HISTORY = 20

/**
 * On-disk metadata captured for each analyze snapshot. Mirrored on the web UI
 * side so the comparison picker can render branch / sha / timestamp labels
 * without re-fetching.
 */
export interface SnapshotMetadata {
  /** Snapshot identifier (also the directory name under `history/`). */
  id: string
  /** ISO timestamp the snapshot was written. */
  createdAt: string
  /** Next.js version string. */
  nextVersion?: string
  /** Git branch (or VERCEL_GIT_COMMIT_REF) when available. */
  gitBranch?: string
  /** Full git commit SHA when available. */
  gitSha?: string
  /** Short (7 char) git commit SHA when available. */
  gitShortSha?: string
  /** Whether the working tree had uncommitted changes when the build ran. */
  gitDirty?: boolean
  /** `true` when built with `--app-dir-only`. */
  appDirOnly?: boolean
  /** `true` when built with `--no-mangling`. */
  noMangling?: boolean
  /** Number of routes captured in this snapshot. */
  routeCount: number
}

/** Index file describing the current "live" build (always present). */
export interface CurrentSnapshotIndex {
  metadata: SnapshotMetadata
}

/** Index file describing all stored historical snapshots, newest first. */
export interface HistoryIndex {
  snapshots: SnapshotMetadata[]
}

const DATA_DIRNAME = 'data'
const HISTORY_DIRNAME = 'history'
const METADATA_FILENAME = 'metadata.json'
const HISTORY_INDEX_FILENAME = 'history.json'

interface BuildSnapshotInputs {
  /** Project root, used to resolve git metadata. */
  projectDir: string
  /** Absolute path of the analyzer output directory (`.next/diagnostics/analyze`). */
  analyzeDir: string
  /** List of route page paths captured in this snapshot. */
  routes: string[]
  appDirOnly?: boolean
  noMangling?: boolean
  /** Maximum number of historical snapshots to keep. Defaults to `MAX_HISTORY`. */
  maxHistory?: number
}

/**
 * Persists a snapshot of the just-emitted analyze data into the rolling
 * `history/` directory and updates the index so the web UI can list it as a
 * comparison baseline.
 *
 * This is invoked after the data files (`analyze.data`, `modules.data`,
 * `routes.json`) have already been written into `<analyzeDir>/data/`. We:
 *
 * 1. Write a `metadata.json` next to `routes.json` describing the *current*
 *    build (so the UI can label it).
 * 2. Copy `<analyzeDir>/data/` into `<analyzeDir>/history/<id>/` so the same
 *    static-file server can serve historical builds via relative URLs.
 * 3. Rebuild `<analyzeDir>/history/history.json` (newest first) and prune
 *    snapshots beyond `maxHistory`.
 *
 * Failures to capture git metadata (no git, detached HEAD, etc.) are non-fatal
 * — fields are simply omitted.
 */
export async function writeAnalyzeSnapshot({
  projectDir,
  analyzeDir,
  routes,
  appDirOnly,
  noMangling,
  maxHistory = MAX_HISTORY,
}: BuildSnapshotInputs): Promise<SnapshotMetadata> {
  const dataDir = path.join(analyzeDir, DATA_DIRNAME)
  const historyDir = path.join(analyzeDir, HISTORY_DIRNAME)

  const gitSha = getGitCommit(projectDir)
  const gitBranch = getGitBranch(projectDir)
  const gitDirty = getGitDirty(projectDir)

  const createdAt = new Date()
  const id = makeSnapshotId(createdAt, gitSha)

  const metadata: SnapshotMetadata = {
    id,
    createdAt: createdAt.toISOString(),
    nextVersion: process.env.__NEXT_VERSION,
    gitBranch,
    gitSha,
    gitShortSha: gitSha ? gitSha.slice(0, 7) : undefined,
    gitDirty,
    appDirOnly,
    noMangling,
    routeCount: routes.length,
  }

  // 1. Write metadata.json into the live data directory.
  await writeFile(
    path.join(dataDir, METADATA_FILENAME),
    JSON.stringify(metadata, null, 2)
  )

  // 2. Snapshot the entire data dir into history/<id>/.
  const snapshotDir = path.join(historyDir, id)
  await mkdir(historyDir, { recursive: true })
  // If the same id already exists (same second + same sha) replace it so the
  // latest run wins.
  await rm(snapshotDir, { recursive: true, force: true })
  await cp(dataDir, snapshotDir, { recursive: true })

  // 3. Rebuild the history index.
  await rewriteHistoryIndex(historyDir, maxHistory)

  return metadata
}

/**
 * Build the snapshot id from the timestamp and git sha. The format is
 * sortable lexicographically (newest last) which keeps directory listings
 * tidy. Format: `YYYYMMDD-HHMMSS-<shortSha|local>`.
 */
function makeSnapshotId(date: Date, gitSha: string | undefined): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  const sha = gitSha ? gitSha.slice(0, 7) : 'local'
  return `${ts}-${sha}`
}

/**
 * Walks `<historyDir>/<id>/metadata.json` for every subdirectory, sorts by
 * `createdAt` (newest first), prunes anything beyond `maxHistory`, and writes
 * the resulting `history.json` index.
 *
 * Snapshots whose metadata file is missing or unreadable are dropped from the
 * index but not deleted from disk (they may still be useful for manual
 * inspection).
 */
async function rewriteHistoryIndex(
  historyDir: string,
  maxHistory: number
): Promise<HistoryIndex> {
  let entries: string[] = []
  try {
    entries = await readdir(historyDir)
  } catch {
    return { snapshots: [] }
  }

  const snapshots: SnapshotMetadata[] = []
  for (const entry of entries) {
    if (entry === HISTORY_INDEX_FILENAME) continue
    const metadataPath = path.join(historyDir, entry, METADATA_FILENAME)
    try {
      const text = await readFile(metadataPath, 'utf8')
      const parsed = JSON.parse(text) as SnapshotMetadata
      // Trust the on-disk metadata's id if present, otherwise fall back to
      // the directory name (backwards compat / hand-edited cases).
      snapshots.push({ ...parsed, id: parsed.id ?? entry })
    } catch {
      // Ignore unreadable / non-snapshot entries.
    }
  }

  // Newest first.
  snapshots.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  // Prune: anything past the cap is removed from disk.
  const kept = snapshots.slice(0, maxHistory)
  const pruned = snapshots.slice(maxHistory)
  await Promise.all(
    pruned.map((snapshot) =>
      rm(path.join(historyDir, snapshot.id), {
        recursive: true,
        force: true,
      })
    )
  )

  const index: HistoryIndex = { snapshots: kept }
  await writeFile(
    path.join(historyDir, HISTORY_INDEX_FILENAME),
    JSON.stringify(index, null, 2)
  )
  return index
}
