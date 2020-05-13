import * as path from 'path'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { compilation } from 'webpack'
import { getBabelError } from './parseBabel'
import { SimpleWebpackError } from './simpleWebpackError'

function getFilename(compilation: compilation.Compilation, m: any): string {
  const requestShortener = compilation.requestShortener
  if (typeof m?.readableIdentifier === 'function') {
    return m.readableIdentifier(requestShortener)
  }

  if (typeof m.resource === 'string') {
    const res = path.relative(compilation.context, m.resource)
    return res.startsWith('.') ? res : `.${path.sep}${res}`
  }
  return m.request ?? '<unknown>'
}

export function getModuleBuildError(
  compilation: compilation.Compilation,
  input: any
): SimpleWebpackError | false {
  if (
    !(
      typeof input === 'object' &&
      input?.name === 'ModuleBuildError' &&
      Boolean(input.module) &&
      input.error instanceof Error
    )
  ) {
    return false
  }

  const err: Error = input.error
  const sourceFilename = getFilename(compilation, input.module)
  const babel = getBabelError(sourceFilename, err)
  if (babel !== false) {
    return babel
  }

  return false
}
