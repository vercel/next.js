import _fs from 'fs'
import type { CacheFs } from '../../shared/lib/utils'

export const nodeFs: CacheFs = {
  readFile: _fs.promises.readFile,
  readFileSync: _fs.readFileSync,
  writeFile: (f, d) => _fs.promises.writeFile(f, d),
  mkdir: (dir) => _fs.promises.mkdir(dir, { recursive: true }),
  stat: (f) => _fs.promises.stat(f),
}
