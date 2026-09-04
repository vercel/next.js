import type { CacheFs } from '../../shared/lib/utils'

import fs from 'fs'

export const nodeFs: CacheFs = {
  existsSync: fs.existsSync,
  readFile: fs.promises.readFile,
  readFileSync: fs.readFileSync,
  writeFile: (f, d) => fs.promises.writeFile(f, d),
  rename: (from, to) => fs.promises.rename(from, to),
  unlink: (f) => fs.promises.unlink(f),
  mkdir: (dir) => fs.promises.mkdir(dir, { recursive: true }),
  stat: (f) => fs.promises.stat(f),
}
