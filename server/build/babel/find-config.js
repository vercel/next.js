import { join } from 'path'
import {loadPartialConfig} from '@babel/core'

export default function findBabelConfig (dir) {
  // We need to provide a location of a filename inside the `dir`.
  // For the name of the file, we could be provide anything.
  const filename = join(dir, 'filename.js')
  return loadPartialConfig({ babelrc: true, filename })
}
