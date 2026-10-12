import { readFile } from 'fs/promises'
import * as nodeModule from 'module'
import fs from 'fs'
import { resolve } from 'path'
import * as Log from '../shared/log'
import { join } from 'path'
import semver from 'semver'

// Resolve from the app for both preparation and reporting; the CLI can run a different version.
export async function getInstalledNextVersion(
  directory: string
): Promise<string> {
  const requireFromApp = requireFromProject(directory)
  const installedNext = JSON.parse(
    await readFile(requireFromApp.resolve('next/package.json'), 'utf8')
  ) as {
    version: string
  }
  const installedVersion = installedNext.version

  if (!semver.valid(installedVersion)) {
    throw new Error('Could not determine the installed Next.js version.')
  }

  return installedVersion
}

// Keep app lookups at runtime rather than bundling the workspace's Next package.
export function requireFromProject(directory: string): NodeRequire {
  return Reflect.apply(Reflect.get(nodeModule, 'createRequire'), null, [
    join(directory, 'package.json'),
  ]) as NodeRequire
}

export function getProjectDir(directory: string | undefined): string {
  const resolved = resolve(directory || '.')
  const realpath =
    process.platform === 'win32' ? fs.realpathSync : fs.realpathSync.native
  const real = realpath(resolved)
  if (resolved !== real && resolved.toLowerCase() === real.toLowerCase()) {
    Log.warn(
      `Invalid casing detected for project dir, received ${resolved} actual path ${real}, see more info here https://nextjs.org/docs/messages/invalid-project-dir-casing`
    )
  }
  return real
}

export function findDir(
  directory: string,
  name: 'app' | 'pages'
): string | null {
  const direct = join(directory, name)
  if (fs.existsSync(direct)) {
    return direct
  }
  const source = join(directory, 'src', name)
  if (fs.existsSync(source)) {
    return source
  }
  return null
}

export function warnMissingReactDependencies(directory: string) {
  const appRequire = requireFromProject(directory)
  for (const dependency of ['react', 'react-dom']) {
    try {
      appRequire.resolve(dependency)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') {
        throw error
      }
      console.warn(
        `The module '${dependency}' was not found. Next.js requires that you include it in 'dependencies' of your 'package.json'. To add it, run 'npm install ${dependency}'`
      )
    }
  }
}
