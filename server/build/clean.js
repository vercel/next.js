import { resolve } from 'path'
import del from 'del'
import getConfig from '../config'

export default function clean (dir) {
  const dist = getConfig(dir).options.dist
  return del(resolve(dir, dist))
}
