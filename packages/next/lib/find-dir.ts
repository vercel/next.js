import path from 'path'
import { existsSync } from './find-pages-dir'

export function findDir(dir: string, dirName: string): string {
  // prioritize ./pages over ./src/pages
  let curDir = path.join(dir, dirName)
  if (existsSync(curDir)) return curDir

  curDir = path.join(dir, dirName)
  if (existsSync(curDir)) return curDir

  return ''
}
