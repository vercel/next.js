import type { CacheFs } from '../../shared/lib/utils'

import fs from 'fs'
import { randomUUID } from 'node:crypto'

export const nodeFs: CacheFs = {
  existsSync: fs.existsSync,
  readFile: fs.promises.readFile,
  readFileSync: fs.readFileSync,
  writeFile: (f, d) => fs.promises.writeFile(f, d),
  writeFileAtomic: async (f, d) => {
    const temporary = `${f}.${randomUUID()}.tmp`
    try {
      await fs.promises.writeFile(temporary, d)
      await fs.promises.link(temporary, f)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
      throw error
    } finally {
      await fs.promises.unlink(temporary).catch(() => {})
    }
  },
  mkdir: (dir) => fs.promises.mkdir(dir, { recursive: true }),
  stat: (f) => fs.promises.stat(f),
}
