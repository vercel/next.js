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
 * Returns the current git branch name for the given working directory, or an
 * empty string if it cannot be determined (not a git repo, detached HEAD,
 * git not installed, etc.).
 */
export function getGitBranch(cwd: string): string {
  try {
    const branch = gitExec('rev-parse --abbrev-ref HEAD', cwd)
    // "HEAD" indicates a detached HEAD state — treat as unknown.
    return branch === 'HEAD' ? '' : branch
  } catch {
    return ''
  }
}

/**
 * Returns the current git commit SHA for the given working directory, or an
 * empty string if it cannot be determined.
 */
export function getGitCommit(cwd: string): string {
  try {
    return gitExec('rev-parse HEAD', cwd)
  } catch {
    return ''
  }
}
