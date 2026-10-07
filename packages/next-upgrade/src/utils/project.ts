import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'
import * as Log from './log'

// Resolves and loads modules the way the app at `directory` would. Use this,
// not `require`, for anything outside this package: the bundler would try to
// bundle a plain `require`.
export function createAppRequire(directory: string): NodeJS.Require {
  return createRequire(path.join(directory, 'package.json'))
}

export function findDir(dir: string, name: 'pages' | 'app'): string | null {
  // prioritize ./${name} over ./src/${name}
  let curDir = path.join(dir, name)
  if (fs.existsSync(curDir)) return curDir

  curDir = path.join(dir, 'src', name)
  if (fs.existsSync(curDir)) return curDir

  return null
}

function printAndExit(message: string): never {
  console.error(message)
  process.exit(1)
}

export function getProjectDir(dir?: string, exitOnEnoent = true) {
  const resolvedDir = path.resolve(dir || '.')
  try {
    // Match Next.js: the native implementation mishandles some Windows paths.
    const realDir =
      process.platform === 'win32'
        ? fs.realpathSync(resolvedDir)
        : fs.realpathSync.native(resolvedDir)

    if (
      resolvedDir !== realDir &&
      resolvedDir.toLowerCase() === realDir.toLowerCase()
    ) {
      Log.warn(
        `Invalid casing detected for project dir, received ${resolvedDir} actual path ${realDir}, see more info here https://nextjs.org/docs/messages/invalid-project-dir-casing`
      )
    }

    return realDir
  } catch (err: any) {
    if (err.code === 'ENOENT' && exitOnEnoent) {
      return printAndExit(
        `Invalid project directory provided, no such directory: ${resolvedDir}`
      )
    }
    throw err
  }
}

export function warnMissingReactDependencies(projectDir: string) {
  // Resolve from the app so downloaded or linked CLI installations do not
  // warn about dependencies that are already installed in the target project.
  for (const dependency of ['react', 'react-dom']) {
    try {
      createAppRequire(projectDir).resolve(dependency)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
        throw err
      }

      console.warn(
        `The module '${dependency}' was not found. Next.js requires that you include it in 'dependencies' of your 'package.json'. To add it, run 'npm install ${dependency}'`
      )
    }
  }
}

export function interopDefault<T>(mod: { default: T } | T): T {
  // @ts-ignore
  return mod.default || mod
}
