import { resolve } from 'path'
import del from 'del'

export default function clean (dir) {
  return del(resolve(dir, '.next'))
}
