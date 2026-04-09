import { unlinkSync, writeFileSync } from 'fs'
import { renameSync } from './rename'

export function writeFileAtomic(filePath: string, content: string): void {
  const tempPath = filePath + '.tmp.' + Math.random().toString(36).slice(2)
  try {
    writeFileSync(tempPath, content, 'utf-8')
    renameSync(tempPath, filePath)
  } catch (e) {
    try {
      unlinkSync(tempPath)
    } catch {
      // ignore
    }
    throw e
  }
}
