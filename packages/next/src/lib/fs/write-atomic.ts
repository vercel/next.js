import { unlink, writeFile } from 'fs/promises'
import { rename } from './rename'

export async function writeFileAtomic(
  filePath: string,
  content: string
): Promise<void> {
  const tempPath = filePath + '.tmp.' + Math.random().toString(36).slice(2)
  try {
    await writeFile(tempPath, content, 'utf-8')
    await rename(tempPath, filePath)
  } catch (e) {
    try {
      await unlink(tempPath)
    } catch {
      // ignore
    }
    throw e
  }
}
