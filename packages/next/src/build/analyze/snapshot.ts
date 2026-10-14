import * as path from 'node:path'
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { z } from 'next/dist/compiled/zod'

import {
  getGitBranch,
  getGitCommit,
  getGitDirty,
  getGitMessage,
} from '../../lib/helpers/git'

const MAX_HISTORY = 20

export const snapshotNameSchema = z
  .string()
  .min(1)
  .refine((name) => {
    try {
      encodeURIComponent(name)
      return true
    } catch {
      return false
    }
  }, 'Invalid analyzer snapshot name')

/** On-disk metadata, mirrored by the analyzer UI. Names are the only snapshot keys. */
export const snapshotMetadataSchema = z.object({
  name: snapshotNameSchema,
  createdAt: z.string().datetime(),
  nextVersion: z.string().optional(),
  gitBranch: z.string().optional(),
  gitSha: z.string().optional(),
  gitShortSha: z.string().optional(),
  gitDirty: z.boolean().optional(),
  gitMessage: z.string().optional(),
  appDirOnly: z.boolean().optional(),
  noMangling: z.boolean().optional(),
  routeCount: z.number().int().nonnegative(),
})
export type SnapshotMetadata = z.infer<typeof snapshotMetadataSchema>

export interface CurrentSnapshotIndex {
  metadata: SnapshotMetadata
}

export const historyIndexSchema = z.object({
  snapshots: z.array(snapshotMetadataSchema),
})
export type HistoryIndex = z.infer<typeof historyIndexSchema>

/** Encode names into one portable path segment, including dots and reserved names. */
export function snapshotDirectory(name: string): string {
  return `snapshot-${encodeURIComponent(snapshotNameSchema.parse(name))}`
}

const DATA_DIRNAME = 'data'
const HISTORY_DIRNAME = 'history'
const METADATA_FILENAME = 'metadata.json'
const HISTORY_INDEX_FILENAME = 'history.json'

interface BuildSnapshotInputs {
  projectDir: string
  analyzeDir: string
  routes: string[]
  appDirOnly?: boolean
  noMangling?: boolean
  /** An explicit name replaces that retained snapshot; omission generates a unique name. */
  snapshot?: string
  maxHistory?: number
}

/** Save the current analysis and refresh the rolling, newest-first history. */
export function writeAnalyzeSnapshot({
  projectDir,
  analyzeDir,
  routes,
  appDirOnly,
  noMangling,
  snapshot,
  maxHistory = MAX_HISTORY,
}: BuildSnapshotInputs): SnapshotMetadata {
  const dataDir = path.join(analyzeDir, DATA_DIRNAME)
  const historyDir = path.join(analyzeDir, HISTORY_DIRNAME)
  const createdAt = new Date()
  mkdirSync(historyDir, { recursive: true })

  let name: string
  let snapshotDir: string
  if (snapshot !== undefined) {
    name = snapshotNameSchema.parse(snapshot)
    snapshotDir = path.join(historyDir, snapshotDirectory(name))
    // Replacement must not merge stale files from the previous capture.
    rmSync(snapshotDir, { recursive: true, force: true, maxRetries: 3 })
    mkdirSync(snapshotDir)
  } else {
    const timestamp = createdAt.toISOString().replace(/[:.]/g, '-')
    for (let attempt = 0; ; attempt++) {
      name = attempt === 0 ? timestamp : `${timestamp}-${attempt}`
      snapshotDir = path.join(historyDir, snapshotDirectory(name))
      try {
        // Exclusive reservation prevents timestamp collisions from overwriting data.
        mkdirSync(snapshotDir)
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
  }

  const gitSha = getGitCommit(projectDir)
  const metadata: SnapshotMetadata = {
    name,
    createdAt: createdAt.toISOString(),
    nextVersion: process.env.__NEXT_VERSION,
    gitBranch: getGitBranch(projectDir),
    gitSha,
    gitShortSha: gitSha?.slice(0, 7),
    gitDirty: getGitDirty(projectDir),
    gitMessage: getGitMessage(projectDir),
    appDirOnly,
    noMangling,
    routeCount: routes.length,
  }

  try {
    writeFileSync(
      path.join(dataDir, METADATA_FILENAME),
      JSON.stringify(metadata, null, 2)
    )
    cpSync(dataDir, snapshotDir, { recursive: true })
    rewriteHistoryIndex(historyDir, maxHistory, name)
    return metadata
  } catch (error) {
    rmSync(snapshotDir, { recursive: true, force: true, maxRetries: 3 })
    throw error
  }
}

/** Read valid snapshot metadata, prune old captures, and rebuild the history index. */
function rewriteHistoryIndex(
  historyDir: string,
  maxHistory: number,
  currentName: string
): void {
  const snapshots: SnapshotMetadata[] = []
  for (const entry of readdirSync(historyDir)) {
    if (entry === HISTORY_INDEX_FILENAME) continue
    try {
      const metadata = snapshotMetadataSchema.parse(
        JSON.parse(
          readFileSync(path.join(historyDir, entry, METADATA_FILENAME), 'utf8')
        )
      )
      if (entry === snapshotDirectory(metadata.name)) snapshots.push(metadata)
    } catch {
      // Unreadable/non-snapshot directories are not part of the history index.
    }
  }
  snapshots.sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) ||
      Number(b.name === currentName) - Number(a.name === currentName)
  )
  for (const snapshot of snapshots.slice(maxHistory)) {
    rmSync(path.join(historyDir, snapshotDirectory(snapshot.name)), {
      recursive: true,
      force: true,
      maxRetries: 3,
    })
  }
  writeFileSync(
    path.join(historyDir, HISTORY_INDEX_FILENAME),
    JSON.stringify(
      { snapshots: snapshots.slice(0, maxHistory) } satisfies HistoryIndex,
      null,
      2
    )
  )
}
