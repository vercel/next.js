import fs from 'fs'
import path from 'path'

export function findPagesDir(dir: string): string | undefined {
  let pagesDir: string | undefined
  let hasConflict = false

  try {
    let curDir = path.join(dir, 'pages')
    fs.accessSync(curDir, fs.constants.F_OK)
    pagesDir = curDir
  } catch (err) {}

  try {
    let curDir = path.join(dir, 'src/pages')
    fs.accessSync(curDir, fs.constants.F_OK)
    hasConflict = !!pagesDir
    pagesDir = curDir
  } catch (err) {}

  if (hasConflict) {
    throw new Error(
      `Can not use both './src/pages' and './pages'. You must one or the either.`
    )
  }
  return pagesDir
}
