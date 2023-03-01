import fs from 'fs'
import path from 'path'
import * as Log from '../build/output/log'

export const existsSync = (f: string): boolean => {
  try {
    fs.accessSync(f, fs.constants.F_OK)
    return true
  } catch (_) {
    return false
  }
}

export function findDir(dir: string, name: 'pages' | 'app'): string | null {
  // prioritize ./${name} over ./src/${name}
  let curDir = path.join(dir, name)
  if (existsSync(curDir)) return curDir

  curDir = path.join(dir, 'src', name)
  if (existsSync(curDir)) return curDir

  return null
}

export function findPagesDir(
  dir: string,
  isAppDirEnabled: boolean
): {
  pagesDir: string | undefined
  appDir: string | undefined
} {
  const pagesDir = findDir(dir, 'pages') || undefined
  const appDir = findDir(dir, 'app') || undefined

  if (isAppDirEnabled && appDir == null && pagesDir == null) {
    throw new Error(
      "> Couldn't find any `pages` or `app` directory. Please create one under the project root"
    )
  }

  if (!isAppDirEnabled) {
    if (appDir != null && pagesDir == null) {
      throw new Error(
        '> The `app` directory is experimental. To enable, add `appDir: true` to your `next.config.js` configuration under `experimental`. See https://nextjs.org/docs/messages/experimental-app-dir-config'
      )
    }
    if (appDir != null && pagesDir != null) {
      Log.warn(
        'The `app` directory is experimental. To enable, add `appDir: true` to your `next.config.js` configuration under `experimental`. See https://nextjs.org/docs/messages/experimental-app-dir-config'
      )
    }
    if (pagesDir == null) {
      throw new Error(
        "> Couldn't find a `pages` directory. Please create one under the project root"
      )
    }
  }

  return {
    pagesDir,
    appDir: isAppDirEnabled ? appDir : undefined,
  }
}
