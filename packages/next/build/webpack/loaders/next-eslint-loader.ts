import { loader } from 'webpack'

const fn: loader.Loader = function (source: string | Buffer) {
  console.log(`ESLint Loader: ${this.resourcePath}`)
  return source
}

export default fn
