import loaderUtils from 'loader-utils'
import { loader } from 'webpack'

const ErrorLoader: loader.Loader = function() {
  const options = loaderUtils.getOptions(this) || {}

  const { reason = 'An unknown error has occurred' } = options

  const err = new Error(reason)
  this.emitError(err)
}

export default ErrorLoader
