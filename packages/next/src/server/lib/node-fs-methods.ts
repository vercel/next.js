import _fs from 'fs'
import { CacheFs } from '../../shared/lib/utils'

export const nodeFs: CacheFs = {
  readFile: (f) => _fs.promises.readFile(f, 'utf8'),
  readFileSync: (f) => _fs.readFileSync(f, 'utf8'),
  writeFile: (f, d) => _fs.promises.writeFile(f, d, 'utf8'),
  mkdir: (dir) => _fs.promises.mkdir(dir, { recursive: true }),
  stat: (f) => _fs.promises.stat(f),
}
