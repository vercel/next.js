import { cyan } from '../../../lib/picocolors'
import path from 'path'
import type { webpack } from 'next/dist/compiled/webpack/webpack'

const ErrorLoader: webpack.LoaderDefinitionFunction = function () {
  // @ts-ignore exists
  const options = this.getOptions() || ({} as any)

  const { reason = 'An unknown error has occurred' } = options

  // @ts-expect-error
  const resource = this._module?.issuer?.resource ?? null
  const context = this.rootContext ?? this._compiler?.context

  const issuer = resource
    ? context
      ? path.relative(context, resource)
      : resource
    : null

  const err = new Error(reason + (issuer ? `\nLocation: ${cyan(issuer)}` : ''))
  this.emitError(err)
}

export default ErrorLoader
