import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { existsSync, readFileSync, realpathSync, statSync } from 'fs'
import { homedir } from 'os'
import findUp from 'next/dist/compiled/find-up'
import * as Log from '../build/output/log'

export type RootBoundary = {
  boundary: string
  marker: string
  root: string
  type: 'repository' | 'home'
}

// folders that are git checkouts / git worktrees are a good indicator
// of the folder that someone's project is contained in.
type GitBoundary =
  | { type: 'repository'; dir: string }
  | { type: 'worktree'; dir: string }

function toRealPath(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

// `homedir()` throws when it cannot determine a home directory, and returns an
// empty string on some platforms. an empty value would match every directory,
// so treat both as "no home directory".
function findHomeDir(): string | undefined {
  try {
    return toRealPath(homedir()) || undefined
  } catch {
    return undefined
  }
}

// if `descendant` is inside of `ancestor` or `descendant` == `ancestor`
function isAncestorOrSelf(ancestor: string, descendant: string): boolean {
  const rel = relative(ancestor, descendant)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

// if `descendant` is inside of `ancestor`
function isStrictAncestor(ancestor: string, descendant: string): boolean {
  const rel = relative(ancestor, descendant)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

// true for a git worktree (its git dir has a `commondir` file);
// this method returns false for a submodule.
function isGitWorktree(dir: string, gitFile: string): boolean {
  let contents: string
  try {
    contents = readFileSync(gitFile, 'utf8')
  } catch {
    return false
  }

  // Match the behavior in git:
  // https://github.com/git/git/blob/13c7afec212fc97ce257d15601659314c6673d6c/setup.c#L1007-L1018
  const match = /^gitdir: (.+?)[\r\n]*$/s.exec(contents)
  if (!match) return false

  const gitDir = resolve(dir, match[1])
  return existsSync(join(gitDir, 'commondir'))
}

// finds the first git repository or git worktree above the
// current working directory. we limit the project root to
// inside a worktree or git repository. this is because if
// you use worktrees, you may have lock files from the
// parent git repo that are in folders that are not relevant
// to watch.
function findGitBoundary(cwd: string): GitBoundary | undefined {
  let isWorktree = false
  const gitDir = findUp.sync(
    (dir) => {
      const candidate = join(dir, '.git')
      const isDirectory = statSync(candidate, {
        throwIfNoEntry: false,
      })?.isDirectory()

      isWorktree = !isDirectory && isGitWorktree(dir, candidate)
      return isDirectory || isWorktree ? dir : undefined
    },
    { cwd, type: 'directory' }
  )
  if (!gitDir) return undefined

  return {
    type: isWorktree ? 'worktree' : 'repository',
    dir: toRealPath(gitDir),
  }
}

const LOCK_FILES = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
]

// Dedicated workspace-root files. pnpm and Lerna declare the root this way.
const WORKSPACE_MARKERS = ['pnpm-workspace.yaml', 'lerna.json']

// npm, Yarn, and Bun declare the root via a package.json `workspaces` field,
// which may be an array or an object (e.g. Yarn's `{ packages: [...] }`).
function hasWorkspacesField(packageJson: string): boolean {
  try {
    return JSON.parse(readFileSync(packageJson, 'utf8')).workspaces != null
  } catch {
    return false
  }
}

function findWorkspaceMarker(directory: string): string | undefined {
  for (const name of WORKSPACE_MARKERS) {
    const markerPath = join(directory, name)
    if (existsSync(markerPath)) {
      return markerPath
    }
  }

  const packageJson = join(directory, 'package.json')
  return hasWorkspacesField(packageJson) ? packageJson : undefined
}

type RootCandidate = { path: string; isWorkspaceMarker: boolean }

function findNextRootCandidate(cwd: string): RootCandidate | undefined {
  // a workspace marker takes precedence over lockfiles, which can be included in
  // the application directory by accident.
  const marker = findUp.sync(findWorkspaceMarker, { cwd })
  if (marker) {
    return { path: marker, isWorkspaceMarker: true }
  }

  const lockFile = findUp.sync(LOCK_FILES, { cwd })
  return lockFile ? { path: lockFile, isWorkspaceMarker: false } : undefined
}

export function findRootDirAndLockFiles(cwd: string): {
  lockFiles: string[]
  rootDir: string
  boundary?: RootBoundary
} {
  const initialCandidate = findNextRootCandidate(cwd)
  if (!initialCandidate)
    return {
      lockFiles: [],
      rootDir: cwd,
    }

  const candidates = [initialCandidate.path]
  let foundWorkspaceMarker = initialCandidate.isWorkspaceMarker
  while (true) {
    const lastCandidate = candidates[candidates.length - 1]
    const currentDir = dirname(lastCandidate)
    const parentDir = dirname(currentDir)

    // dirname('/')==='/' so if we happen to reach the FS root (as might happen in a container we need to quit to avoid looping forever
    if (parentDir === currentDir) break

    const nextCandidate = findNextRootCandidate(parentDir)

    if (!nextCandidate) break

    // findNextRootCandidate searches for markers all the way up, so a non-marker
    // here means there is no higher marker: nothing above can extend the root.
    if (foundWorkspaceMarker && !nextCandidate.isWorkspaceMarker) break

    candidates.push(nextCandidate.path)
    foundWorkspaceMarker ||= nextCandidate.isWorkspaceMarker
  }

  // filter out candidates that would push the root past a
  // git boundary or into the home directory.
  const homeDir = findHomeDir()
  const gitBoundary = findGitBoundary(cwd)

  const acceptedCandidates: string[] = []
  let boundary: RootBoundary | undefined

  for (const candidate of candidates) {
    const dir = dirname(candidate)

    // the app's own directory is always a valid root. even if it
    // is the home directory.
    if (dir !== cwd) {
      const resolvedDir = toRealPath(dir)

      // `dir` sits above the repo or worktree that contains the app.
      if (gitBoundary && isStrictAncestor(resolvedDir, gitBoundary.dir)) {
        // add a warning for going beyond a repository
        if (gitBoundary.type === 'repository') {
          boundary = {
            boundary: gitBoundary.dir,
            marker: candidate,
            root: dir,
            type: 'repository',
          }
        }
        break
      }

      // never treat the home directory (or above) as the root.
      if (homeDir && isAncestorOrSelf(resolvedDir, homeDir)) {
        boundary = {
          boundary: homeDir,
          marker: candidate,
          root: dir,
          type: 'home',
        }
        break
      }
    }

    acceptedCandidates.push(candidate)
  }

  return {
    lockFiles: acceptedCandidates.filter((candidate) =>
      LOCK_FILES.includes(basename(candidate))
    ),
    rootDir: acceptedCandidates.length
      ? dirname(acceptedCandidates[acceptedCandidates.length - 1])
      : cwd,
    boundary,
  }
}

export function warnDuplicatedLockFiles(lockFiles: string[]) {
  if (lockFiles.length <= 1) return

  const config = process.env.TURBOPACK
    ? 'turbopack.root'
    : 'outputFileTracingRoot'
  const docs = process.env.TURBOPACK
    ? 'https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory'
    : 'https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats'

  const rootLockFile = lockFiles[lockFiles.length - 1]
  const additionalLockFiles = lockFiles
    .slice(0, -1)
    .map((str) => `\n   * ${str}`)
    .join('')

  Log.warnOnce(
    `Warning: Next.js inferred your workspace root, but it may not be correct.\n` +
      ` We detected multiple lockfiles and selected the directory of ${rootLockFile} as the root directory.\n` +
      ` To silence this warning, set \`${config}\` in your Next.js config, or consider ` +
      `removing one of the lockfiles if it's not needed.\n` +
      `   See ${docs} for more information.\n` +
      ` Detected additional lockfiles: ${additionalLockFiles}\n`
  )
}

export function warnRootBoundary({
  boundary,
  marker,
  root,
  type,
}: RootBoundary) {
  const config = process.env.TURBOPACK
    ? 'turbopack.root'
    : 'outputFileTracingRoot'
  const reason =
    type === 'repository'
      ? `it is outside the current Git repository (${boundary})`
      : `it would include your home directory (${boundary})`

  Log.warnOnce(
    `Warning: Next.js ignored ${basename(marker)} in ${root} because ${reason}.\n` +
      ` To use this directory, set \`${config}\` in your Next.js config.\n`
  )
}
