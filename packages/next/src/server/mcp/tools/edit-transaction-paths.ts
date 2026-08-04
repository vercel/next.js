import { existsSync, lstatSync, realpathSync } from 'node:fs'
import path from 'node:path'
import type { PageExtensions } from '../../../build/page-extensions-type'
import {
  getPossibleInstrumentationHookFilenames,
  getPossibleMiddlewareFilenames,
} from '../../../build/utils'
import { createValidFileMatcher } from '../../lib/find-page-file'

export const MAX_CHANGED_PATHS = 2_048
const MAX_CHANGED_PATH_CHARACTERS = 1_048_576

export type RouteWatcherOptions = {
  appDir: string | undefined
  pagesDir: string | undefined
  pageExtensions: PageExtensions
  tsconfigPath: string | undefined
}

function pathIsInside(directory: string, candidate: string) {
  const relative = path.relative(directory, candidate)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

function isCaseInsensitiveFileSystem(directory: string) {
  let current = realpathSync.native(directory)
  for (;;) {
    const parent = path.dirname(current)
    const name = path.basename(current)
    const alternateName = name.replace(/[A-Za-z]/, (character) =>
      character === character.toLowerCase()
        ? character.toUpperCase()
        : character.toLowerCase()
    )
    if (alternateName !== name) {
      try {
        return realpathSync.native(path.join(parent, alternateName)) === current
      } catch (error) {
        if (
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        ) {
          return false
        }
        throw error
      }
    }
    if (parent === current) return process.platform === 'win32'
    current = parent
  }
}

function createRouteWatcherPathMatcher(
  projectPath: string,
  { appDir, pagesDir, pageExtensions }: RouteWatcherOptions,
  caseInsensitive: boolean
) {
  const pathKey = (value: string) =>
    caseInsensitive ? value.toLowerCase() : value
  const matcherPageExtensions = pageExtensions.map(pathKey)
  const pagesRoots = new Set(
    [
      pagesDir,
      path.join(projectPath, 'pages'),
      path.join(projectPath, 'src', 'pages'),
    ]
      .filter((directory): directory is string => directory !== undefined)
      .map((directory) => pathKey(path.resolve(directory)))
  )
  const appRoots = new Set(
    [
      appDir,
      path.join(projectPath, 'app'),
      path.join(projectPath, 'src', 'app'),
    ]
      .filter((directory): directory is string => directory !== undefined)
      .map((directory) => pathKey(path.resolve(directory)))
  )
  const pagesFileMatcher = createValidFileMatcher(
    matcherPageExtensions,
    undefined
  )
  const appFileMatchers = [...appRoots].map(
    (directory) =>
      [
        directory,
        createValidFileMatcher(matcherPageExtensions, directory),
      ] as const
  )
  const rootConventionFiles = new Set(
    [
      ...getPossibleMiddlewareFilenames(projectPath, matcherPageExtensions),
      ...getPossibleMiddlewareFilenames(
        path.join(projectPath, 'src'),
        matcherPageExtensions
      ),
      ...getPossibleInstrumentationHookFilenames(
        projectPath,
        matcherPageExtensions
      ),
      ...getPossibleInstrumentationHookFilenames(
        path.join(projectPath, 'src'),
        matcherPageExtensions
      ),
    ].map((file) => pathKey(path.resolve(file)))
  )

  return (absolute: string) => {
    const candidate = pathKey(absolute)
    if (rootConventionFiles.has(candidate)) return true
    if (
      [...pagesRoots].some((directory) => pathIsInside(directory, candidate)) &&
      pagesFileMatcher.isPageFile(candidate)
    ) {
      return true
    }
    return appFileMatchers.some(
      ([directory, matcher]) =>
        pathIsInside(directory, candidate) &&
        (matcher.isAppRouterPage(candidate) ||
          matcher.isAppLayoutPage(candidate) ||
          matcher.isAppDefaultPage(candidate) ||
          matcher.isRootNotFound(candidate))
    )
  }
}

/**
 * Resolve every existing segment to its filesystem spelling while rejecting symbolic links.
 * Missing suffixes are appended to the last canonical existing ancestor because agents commonly
 * declare files before creating them.
 */
function resolveCanonicalChangedPath(
  projectRoot: string,
  canonicalProjectRoot: string,
  projectRelative: string,
  changedPath: string
) {
  const segments = projectRelative.split(path.sep)
  let lexicalCurrent = projectRoot
  let canonicalCurrent = canonicalProjectRoot
  for (let index = 0; index < segments.length; index++) {
    lexicalCurrent = path.join(lexicalCurrent, segments[index])
    try {
      if (lstatSync(lexicalCurrent).isSymbolicLink()) {
        throw new Error(
          `Changed path traverses a symbolic link: ${changedPath}`
        )
      }
      canonicalCurrent = realpathSync.native(lexicalCurrent)
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      ) {
        return path.join(canonicalCurrent, ...segments.slice(index))
      }
      throw error
    }
  }
  return canonicalCurrent
}

function resolveCanonicalConfiguredPath(
  projectRoot: string,
  canonicalProjectRoot: string,
  configuredPath: string
) {
  try {
    return realpathSync.native(configuredPath)
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return path.resolve(
        canonicalProjectRoot,
        path.relative(projectRoot, configuredPath)
      )
    }
    throw error
  }
}

export function resolveEditTransactionPaths(
  projectPath: string,
  turbopackRootPath: string,
  routeWatcherOptions: RouteWatcherOptions,
  changedPaths: string[]
) {
  const requestedPathCharacters = changedPaths.reduce(
    (total, changedPath) => total + changedPath.length,
    0
  )
  if (requestedPathCharacters > MAX_CHANGED_PATH_CHARACTERS) {
    throw new Error(
      `Changed paths exceed ${MAX_CHANGED_PATH_CHARACTERS} characters`
    )
  }
  const projectRoot = path.resolve(projectPath)
  const turbopackRoot = path.resolve(turbopackRootPath)
  const canonicalProjectRoot = realpathSync.native(projectRoot)
  const canonicalTurbopackRoot = realpathSync.native(turbopackRoot)
  const caseInsensitive = isCaseInsensitiveFileSystem(canonicalProjectRoot)
  const pathKey = (value: string) =>
    caseInsensitive ? value.toLowerCase() : value
  const configuredTsconfig = resolveCanonicalConfiguredPath(
    projectRoot,
    canonicalProjectRoot,
    path.resolve(
      projectRoot,
      routeWatcherOptions.tsconfigPath ?? 'tsconfig.json'
    )
  )
  const canonicalAppDir = routeWatcherOptions.appDir
    ? resolveCanonicalConfiguredPath(
        projectRoot,
        canonicalProjectRoot,
        routeWatcherOptions.appDir
      )
    : undefined
  const canonicalPagesDir = routeWatcherOptions.pagesDir
    ? resolveCanonicalConfiguredPath(
        projectRoot,
        canonicalProjectRoot,
        routeWatcherOptions.pagesDir
      )
    : undefined
  const isRouteWatcherPath = createRouteWatcherPathMatcher(
    canonicalProjectRoot,
    {
      ...routeWatcherOptions,
      appDir: canonicalAppDir,
      pagesDir: canonicalPagesDir,
    },
    caseInsensitive
  )
  const hasTypeScriptConfiguration = existsSync(configuredTsconfig)
  const typeScriptActivationRoots = [canonicalAppDir, canonicalPagesDir].filter(
    (directory): directory is string => directory !== undefined
  )
  const resolved = new Set<string>()

  for (const changedPath of new Set(changedPaths)) {
    if (path.isAbsolute(changedPath)) {
      throw new Error(`Changed path must be project-relative: ${changedPath}`)
    }
    const absolute = path.resolve(projectRoot, changedPath)
    const projectRelative = path.relative(projectRoot, absolute)
    if (
      projectRelative === '' ||
      projectRelative === '..' ||
      projectRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(projectRelative)
    ) {
      throw new Error(`Changed path leaves the project root: ${changedPath}`)
    }
    if (changedPath.split(/[\\/]+/).includes('..')) {
      throw new Error(
        `Changed path must not contain parent-directory segments: ${changedPath}`
      )
    }

    const canonicalAbsolute = resolveCanonicalChangedPath(
      projectRoot,
      canonicalProjectRoot,
      projectRelative,
      changedPath
    )
    try {
      if (lstatSync(canonicalAbsolute).isDirectory()) {
        throw new Error(
          `Changed path must identify a file, not a directory: ${changedPath}`
        )
      }
    } catch (error) {
      if (
        !(
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        )
      ) {
        throw error
      }
    }
    const canonicalProjectRelative = path.relative(
      canonicalProjectRoot,
      canonicalAbsolute
    )

    const normalizedProjectRelative = canonicalProjectRelative
      .split(path.sep)
      .join('/')
    const reservedPath = pathKey(normalizedProjectRelative)
    if (
      /^\.env(?:\..+)?$/.test(reservedPath) ||
      reservedPath === 'tsconfig.json' ||
      reservedPath === 'jsconfig.json' ||
      pathKey(canonicalAbsolute) === pathKey(configuredTsconfig) ||
      /^next\.config\.(?:js|mjs|cjs|ts|mts|cts)$/.test(reservedPath) ||
      isRouteWatcherPath(canonicalAbsolute)
    ) {
      throw new Error(
        `Changed path is watched outside the Turbopack source transaction: ${changedPath}`
      )
    }
    if (
      !hasTypeScriptConfiguration &&
      /\.tsx?$/.test(reservedPath) &&
      typeScriptActivationRoots.some((directory) =>
        pathIsInside(pathKey(directory), pathKey(canonicalAbsolute))
      )
    ) {
      throw new Error(
        `Changed path would activate TypeScript through an independent dev-server watcher: ${changedPath}`
      )
    }

    const turbopackRelative = path.relative(
      canonicalTurbopackRoot,
      canonicalAbsolute
    )
    if (
      turbopackRelative === '' ||
      turbopackRelative === '..' ||
      turbopackRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(turbopackRelative)
    ) {
      throw new Error(
        `Changed path leaves the Turbopack filesystem root: ${changedPath}`
      )
    }
    resolved.add(turbopackRelative)
  }

  const result = [...resolved]
  const pathCharacters = result.reduce(
    (total, changedPath) => total + changedPath.length,
    0
  )
  if (pathCharacters > MAX_CHANGED_PATH_CHARACTERS) {
    throw new Error(
      `Changed paths exceed ${MAX_CHANGED_PATH_CHARACTERS} characters`
    )
  }
  return result
}
