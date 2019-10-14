import fs from 'fs-extra'
import path from 'path'
import spawn from 'cross-spawn'
import simplegit from 'simple-git/promise'

function isInGitRepo(path: string): boolean {
  const gitRevParse = spawn.sync(
    'git',
    ['rev-parse', '--is-inside-work-tree'],
    {
      cwd: path,
      stdio: 'ignore',
    }
  )

  if (gitRevParse.status === 0) {
    return true
  }
  return false
}

function isGitInstalled(): boolean {
  const command = spawn.sync('git', ['--version'], {
    stdio: 'ignore',
  })

  if (command.error) {
    return false
  }
  return true
}

export async function initGit(root: string): Promise<boolean> {
  let initializedGit = false
  try {
    if (!isGitInstalled() || isInGitRepo(root)) {
      return false
    }

    const git = simplegit(root)
    await git.init()
    initializedGit = true
    await git.add('./*')
    await git.commit('Initial commit from Create Next App')
    return true
  } catch (e) {
    if (initializedGit) {
      try {
        fs.removeSync(path.join(root, '.git'))
      } catch (err) {
        // ignore
      }
    }

    return false
  }
}
