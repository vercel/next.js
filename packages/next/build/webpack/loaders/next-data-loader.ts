import { loader } from 'webpack'
import hash from 'next/dist/compiled/string-hash'
import { basename } from 'path'
const nextDataLoader: loader.Loader = function () {
  const filename = this.resourcePath
  return `
  import {createHook} from 'next/data'

  export default createHook(undefined, {key: ${JSON.stringify(
    basename(filename) + '-' + hash(filename)
  )}})
  `
}

export default nextDataLoader
