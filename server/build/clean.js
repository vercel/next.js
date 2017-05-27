import { resolve } from 'path'
import del from 'del'
import getConfig from '../config'

export default function clean (dir) {
  const dist = getConfig(dir).distDir
  return del(resolve(dir, dist))
}
