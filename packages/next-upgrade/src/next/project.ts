import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { join } from 'path'
import semver from 'next/dist/compiled/semver'

// Resolve from the app for both preparation and reporting; the CLI can run a different version.
export async function getInstalledNextVersion(
  directory: string
): Promise<string> {
  const requireFromApp = createRequire(join(directory, 'package.json'))
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
