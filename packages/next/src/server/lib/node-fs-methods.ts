import _fs from 'fs'
import type { CacheFs } from '../../shared/lib/utils'

export const nodeFs: CacheFs = {
  readFile: (f) => _fs.promises.readFile(f),
  readFileSync: (f) => _fs.readFileSync(f),
  writeFile: (f, d) => _fs.promises.writeFile(f, d),
  mkdir: (dir) => _fs.promises.mkdir(dir, { recursive: true }),
  stat: (f) => _fs.promises.stat(f),
  createWriteStream: (f) => _fs.createWriteStream(f),
}
