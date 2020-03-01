import fs from 'fs'
import path from 'path'

const existsSync = (f: string): boolean => {
  try {
    fs.accessSync(f, fs.constants.F_OK)
    return true
  } catch (_) {
    return false
  }
}

export function findPagesDir(dir: string): string {
  // prioritize ./pages over ./src/pages
  let curDir = path.join(dir, 'pages')
  if (existsSync(curDir)) return curDir

  curDir = path.join(dir, 'src/pages')
  if (existsSync(curDir)) return curDir

  // Check one level up the tree to see if the pages directory might be there
  if (existsSync(path.join(dir, '..', 'pages'))) {
    throw new Error(
      '> No `pages` directory found. Did you mean to run `next` in the parent (`../`) directory?'
    )
  }

  throw new Error(
    "> Couldn't find a `pages` directory. Please create one under the project root"
  )
}
