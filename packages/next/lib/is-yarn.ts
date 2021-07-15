import { join } from 'path'
import { fileExists } from './file-exists'

export const isYarn = async (dir: string) =>
  await fileExists(join(dir, 'yarn.lock')).catch(() => false)
