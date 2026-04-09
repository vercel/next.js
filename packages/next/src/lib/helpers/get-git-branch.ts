import { execSync } from 'child_process'

/**
 * Returns the current git branch name for the given working directory, or an
 * empty string if it cannot be determined (not a git repo, detached HEAD,
 * git not installed, etc.).
 */
export function getGitBranch(cwd: string): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    // "HEAD" indicates a detached HEAD state — treat as unknown.
    return branch === 'HEAD' ? '' : branch
  } catch {
    return ''
  }
}
