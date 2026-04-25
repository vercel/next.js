import { execSync } from 'child_process'

function gitExec(args: string, cwd: string): string {
  return execSync(`git ${args}`, {
    cwd,
    timeout: 2000,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim()
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
    return gitExec('symbolic-ref --short HEAD', cwd)
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
    return gitExec('rev-parse HEAD', cwd)
  } catch {
    return undefined
  }
}
