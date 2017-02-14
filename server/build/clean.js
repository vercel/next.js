import { resolve } from 'path'
import del from 'del'

export default function clean (dir, folderName = '.next') {
  return del(resolve(dir, folderName))
}
