import fs from 'fs'
import path from 'path'
import * as Log from '../build/output/log'
import { getTurbopackCacheVersion } from '../build/swc'
import {
  getGitWorktreeInfo,
  listLinkedWorktreeRoots,
  type GitWorktreeInfo,
} from './git-worktree'

export function seedTurbopackCacheIfNeeded({
  projectDir,
  distDir,
}: {
  projectDir: string
  distDir: string
}): void {
  // This gets the version assuming that nothing is dirty.
  // If things are dirty, turbopack would write things
  // in a different location. There are other circumstances
  // as well. This only matters for people developing turbopack
  // see handle_db_versioning in turbotask backend for more details.
  const version = getTurbopackCacheVersion()
  if (!version) return

  const worktreeInfo = getGitWorktreeInfo(projectDir)
  if (!worktreeInfo) return

  const cacheDir = path.join(distDir, 'cache', 'turbopack')
  const targetVersionDir = path.join(cacheDir, version)
  if (dirHasEntries(targetVersionDir)) return

  let sourceVersionDir: string | undefined
  try {
    sourceVersionDir = findSeedSource(
      worktreeInfo,
      projectDir,
      distDir,
      version
    )
  } catch {
    return
  }
  if (!sourceVersionDir) return

  const tmpDir = `${targetVersionDir}.seeding`
  // Making sure we don't copy partial data if process interrupted
  // There is a potential race condition here
  // if someone wrote to the cache while we were seeding it
  // but with the immutable design and all that, I'm not super worried
  try {
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.rmSync(tmpDir, { recursive: true, force: true })
    seedCacheDir(sourceVersionDir, tmpDir)
    fs.renameSync(tmpDir, targetVersionDir)
    Log.info(`Seeded Turbopack cache from ${sourceVersionDir}.`)
  } catch {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    Log.warn(
      `Failed to seed Turbopack cache from ${sourceVersionDir} to ${targetVersionDir}.`
    )
  }
}

function findSeedSource(
  worktreeInfo: GitWorktreeInfo,
  projectDir: string,
  distDir: string,
  version: string
): string | undefined {
  const projectRelToWorktree = path.relative(
    worktreeInfo.worktreeRoot,
    projectDir
  )
  const distRelToProject = path.relative(projectDir, distDir)
  const currentWorktree = path.resolve(worktreeInfo.worktreeRoot)

  // We are going to find the best candidate worktree
  // based on the most recently used cache directory.
  // We only look at our version

  let best: { versionDir: string; lastUsedMs: number } | undefined
  for (const root of [
    worktreeInfo.mainRepoRoot,
    ...listLinkedWorktreeRoots(worktreeInfo.mainRepoRoot),
  ]) {
    if (path.resolve(root) === currentWorktree) continue
    const versionDir = path.join(
      root,
      projectRelToWorktree,
      distRelToProject,
      'cache',
      'turbopack',
      version
    )
    const lastUsedMs = currentLastUsedMs(versionDir)
    if (lastUsedMs === undefined) continue
    if (!best || lastUsedMs > best.lastUsedMs) {
      best = { versionDir, lastUsedMs }
    }
  }
  return best?.versionDir
}

// When the cache in `versionDir` was last used, in epoch milliseconds, or undefined if there is
// no usable cache there. Read from the `last_used_time` the persistence layer records in CURRENT.
//
// No fallback for the pre-JSON CURRENT format: callers only look inside the directory named for
// the running binary's own cache version, which no binary that old could have written.
function currentLastUsedMs(versionDir: string): number | undefined {
  let lastUsed
  try {
    lastUsed = JSON.parse(
      fs.readFileSync(path.join(versionDir, 'CURRENT'), 'utf8')
    ).last_used_time
  } catch {
    // missing, unreadable, or not valid JSON - treat it as not a seed candidate
    return undefined
  }
  if (typeof lastUsed !== 'string') return undefined
  const parsed = Date.parse(lastUsed)
  return Number.isNaN(parsed) ? undefined : parsed
}

function dirHasEntries(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length > 0
  } catch {
    return false
  }
}

const IMMUTABLE_CACHE_FILE = /\.(sst|blob|meta|del)$/

function seedCacheDir(src: string, dst: string): void {
  const stat = fs.lstatSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      seedCacheDir(path.join(src, name), path.join(dst, name))
    }
  } else if (IMMUTABLE_CACHE_FILE.test(src)) {
    fs.linkSync(src, dst)
  } else {
    // Mutable/unknown (CURRENT, LOG, …) - copy so it gets its own inode.
    fs.copyFileSync(src, dst)
  }
}
