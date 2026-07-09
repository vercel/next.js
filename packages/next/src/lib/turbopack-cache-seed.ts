import fs from 'fs'
import path from 'path'
import * as Log from '../build/output/log'
import { getGitWorktreeInfo } from './git-worktree'

export enum TurbopackCacheSeedMode {
  Build,
  Dev,
}

export function seedTurbopackCacheIfNeeded({
  projectDir,
  distDir,
  mode,
}: {
  projectDir: string
  distDir: string
  mode: TurbopackCacheSeedMode
}): void {
  // Only worktrees can seed from a sibling; no-op for the main checkout or outside a git repo.
  const worktreeInfo = getGitWorktreeInfo(projectDir)
  if (!worktreeInfo) return

  const cacheDir = path.join(distDir, 'cache', 'turbopack')
  try {
    if (dirHasEntries(cacheDir)) return

    // So I made the call to only copy from the main project directory.
    // You could instead look at all the "sibling" worktrees
    // and copy from them. But this feels a bit arbitrary.
    // Which do you pick? Do you do some comparison of the branches?
    // It also felt like siblings are exploring different possibility with
    // perhaps the main repo being the place all the initial work happened.
    // This is speculative and I'm not suure how best to figure out if this
    // is the right heuristic other than maybe user feedback? Or recording stats?
    const mainRepoRoot = worktreeInfo.mainRepoRoot
    const mainCacheDir = path.join(
      mainRepoRoot,
      '.next',
      mode === TurbopackCacheSeedMode.Dev ? 'dev' : '',
      'cache',
      'turbopack'
    )
    seedCacheDir(mainCacheDir, cacheDir)
  } catch {
    // Best-effort: never fail a build because seeding didn't work.
    Log.warn(
      `Failed to seed Turbopack cache from main checkout at ${worktreeInfo.mainRepoRoot} to ${cacheDir}.`
    )
  }
}

function dirHasEntries(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length > 0
  } catch {
    return false
  }
}

const IMMUTABLE_CACHE_FILE = /\.(sst|blob|meta)$/

function seedCacheDir(src: string, dst: string): void {
  const stat = fs.lstatSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true })
    for (const name of fs.readdirSync(src)) {
      seedCacheDir(path.join(src, name), path.join(dst, name))
    }
  } else if (stat.isSymbolicLink()) {
    fs.symlinkSync(fs.readlinkSync(src), dst)
  } else if (IMMUTABLE_CACHE_FILE.test(src)) {
    fs.linkSync(src, dst)
  } else {
    // Mutable/unknown (CURRENT, LOG, …) — copy so it gets its own inode.
    fs.copyFileSync(src, dst)
  }
}
