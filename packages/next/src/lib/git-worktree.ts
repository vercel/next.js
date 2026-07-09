import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import findUp from 'next/dist/compiled/find-up'

function getGitProjectRoot(dotGitFile: string): string | undefined {
  try {
    const gitWorktreePath = readFileSync(dotGitFile, 'utf8').match(
      /^gitdir:\s*(.+?)\s*$/m
    )
    if (!gitWorktreePath) return undefined
    // The format here is <project>/.git/worktrees/<name>
    // So we are trying to get to project directory
    return dirname(dirname(dirname(resolve(dotGitFile, gitWorktreePath[1]))))
  } catch {
    return undefined
  }
}

export interface GitWorktreeInfo {
  worktreeRoot: string
  mainRepoRoot: string
  isChild: boolean
}

export function getGitWorktreeInfo(cwd: string): GitWorktreeInfo | undefined {
  const found = findUp.sync('.git', { cwd, type: 'file' })
  if (!found) return undefined

  const projectRoot = getGitProjectRoot(found)
  if (!projectRoot) return undefined

  return {
    worktreeRoot: dirname(found),
    mainRepoRoot: projectRoot,
    isChild: dirname(found).startsWith(projectRoot),
  }
}
