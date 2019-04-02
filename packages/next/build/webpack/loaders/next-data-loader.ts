import {loader} from 'webpack'
import hash from 'string-hash'
import {basename} from 'path'
const nextDataLoader: loader.Loader = function (source) {
  const filename = this.resourcePath
  return `
  import {createHook} from 'next/data'
  
  export default createHook(undefined, {key: ${JSON.stringify(basename(filename) + '-' + hash(filename))}})
  `
}

export default nextDataLoader
