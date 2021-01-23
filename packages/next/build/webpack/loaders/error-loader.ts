import chalk from 'chalk'
import loaderUtils from 'next/dist/compiled/loader-utils'
import path from 'path'
import { webpack } from 'next/dist/compiled/webpack/webpack'

const ErrorLoader: webpack.loader.Loader = function () {
  const options = loaderUtils.getOptions(this) || {}

  const { reason = 'An unknown error has occurred' } = options

  const resource = this._module?.issuer?.resource ?? null
  const context = this.rootContext ?? this._compiler?.context

  const issuer = resource
    ? context
      ? path.relative(context, resource)
      : resource
    : null

  const err = new Error(
    reason + (issuer ? `\nLocation: ${chalk.cyan(issuer)}` : '')
  )
  this.emitError(err)
}

export default ErrorLoader
