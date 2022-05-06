import fs from 'fs'
import path from 'path'

export const existsSync = (f: string): boolean => {
  try {
    fs.accessSync(f, fs.constants.F_OK)
    return true
  } catch (_) {
    return false
  }
}

function findDir(dir: string, name: 'pages' | 'views'): string | null {
  // prioritize ./${name} over ./src/${name}
  let curDir = path.join(dir, name)
  if (existsSync(curDir)) return curDir

  curDir = path.join(dir, 'src', name)
  if (existsSync(curDir)) return curDir

  return null
}

export function findPagesDir(
  dir: string,
  views?: boolean
): { pages: string; views?: string } {
  const pagesDir = findDir(dir, 'pages')
  let viewsDir: undefined | string

  if (views) {
    viewsDir = findDir(dir, 'views') || undefined
  }

  // TODO: allow "root" dir without pages dir
  if (pagesDir === null) {
    throw new Error(
      "> Couldn't find a `pages` directory. Please create one under the project root"
    )
  }

  return {
    pages: pagesDir,
    views: viewsDir,
  }
}
