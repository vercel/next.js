import * as path from 'path'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { compilation } from 'webpack'
import { getBabelError } from './parseBabel'
import { getCssError } from './parseCss'
import { SimpleWebpackError } from './simpleWebpackError'

function getFilename(compilation: compilation.Compilation, m: any): string {
  let ctx: string | null =
    compilation.compiler?.context ?? compilation.context ?? null
  if (ctx !== null && typeof m.resource === 'string') {
    const res = path.relative(ctx, m.resource).replace(/\\/g, path.posix.sep)
    return res.startsWith('.') ? res : `.${path.posix.sep}${res}`
  }

  const requestShortener = compilation.requestShortener
  if (typeof m?.readableIdentifier === 'function') {
    return m.readableIdentifier(requestShortener)
  }

  return m.request ?? m.userRequest ?? '<unknown>'
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

  const css = getCssError(sourceFilename, err)
  if (css !== false) {
    return css
  }

  return false
}
