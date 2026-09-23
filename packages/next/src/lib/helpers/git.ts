import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

function gitExec(args: string[], cwd: string, timeout = 2000): string {
  const result = spawnSync('git', args, {
    cwd,
    timeout,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} exited with status ${result.status}`)
  }
  return result.stdout.trim()
}

/**
 * Returns the current git branch name for the given working directory, or
 * undefined if it cannot be determined (not a git repo, detached HEAD,
 * git not installed, etc.). Prefers VERCEL_GIT_COMMIT_REF when set.
 */
export function getGitBranch(cwd: string): string | undefined {
  if (process.env.VERCEL_GIT_COMMIT_REF) {
    return process.env.VERCEL_GIT_COMMIT_REF
  }
  try {
    // symbolic-ref --short HEAD: returns the branch name for regular branches,
    // works on repos with no commits, and exits non-zero in detached HEAD state
    // (caught below and treated as unknown).
    return gitExec(['symbolic-ref', '--short', 'HEAD'], cwd)
  } catch {
    return undefined
  }
}

/**
 * Returns the current git commit SHA for the given working directory, or
 * undefined if it cannot be determined. Prefers VERCEL_GIT_COMMIT_SHA when
 * set.
 */
export function getGitCommit(cwd: string): string | undefined {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA
  }
  try {
    return gitExec(['rev-parse', 'HEAD'], cwd)
  } catch {
    return undefined
  }
}

/**
 * Returns true if the working tree has uncommitted changes. Returns undefined
 * when the dirty status cannot be determined (not a git repo, git not
 * installed, etc.).
 */
export function getGitDirty(cwd: string): boolean | undefined {
  try {
    return gitExec(['status', '--porcelain'], cwd).length > 0
  } catch {
    return undefined
  }
}

/**
 * Returns a content-sensitive fingerprint for the current working tree.
 * Only the final digest is exposed; paths and file hashes remain inside the
 * digest input. Non-ignored untracked files are included explicitly because
 * `git diff HEAD` does not report them.
 */
export function getGitWorktreeFingerprint(cwd: string): string | undefined {
  try {
    const status = gitExec(
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      cwd,
      30_000
    )
    const diff = gitExec(
      ['diff', '--binary', '--no-ext-diff', 'HEAD', '--'],
      cwd,
      30_000
    )
    const untracked = gitExec(
      ['ls-files', '--others', '--exclude-standard', '-z'],
      cwd,
      30_000
    )
      .split('\0')
      .filter(Boolean)
      .sort()

    const hash = createHash('sha256')
    hash.update('next-worktree-v1\0')
    hash.update(status)
    hash.update('\0')
    hash.update(diff)
    for (const filename of untracked) {
      hash.update('\0untracked\0')
      hash.update(filename)
      hash.update('\0')
      hash.update(
        gitExec(['hash-object', '--no-filters', '--', filename], cwd, 30_000)
      )
    }
    return hash.digest('hex')
  } catch {
    return undefined
  }
}

/**
 * Returns the first line of the HEAD commit message, or undefined when it
 * cannot be determined. Prefers VERCEL_GIT_COMMIT_MESSAGE when set.
 */
export function getGitMessage(cwd: string): string | undefined {
  if (process.env.VERCEL_GIT_COMMIT_MESSAGE) {
    return process.env.VERCEL_GIT_COMMIT_MESSAGE.split('\n')[0].trim()
  }
  try {
    return gitExec(['log', '-1', '--pretty=%s'], cwd)
  } catch {
    return undefined
  }
}
