import fs from 'fs'
import path from 'path'

export function findDir(dir: string, name: 'pages' | 'app'): string | null {
  // prioritize ./${name} over ./src/${name}
  let curDir = path.join(dir, name)
  if (fs.existsSync(curDir)) return curDir

  curDir = path.join(dir, 'src', name)
  if (fs.existsSync(curDir)) return curDir

  return null
}

export function findPagesDir(dir: string): {
  pagesDir: string | undefined
  appDir: string | undefined
} {
  const pagesDir = findDir(dir, 'pages') || undefined
  const appDir = findDir(dir, 'app') || undefined

  if (appDir == null && pagesDir == null) {
    throw new Error(
      "> Couldn't find any `pages` or `app` directory. Please create one under the project root"
    )
  }

  return {
    pagesDir,
    appDir,
  }
}
