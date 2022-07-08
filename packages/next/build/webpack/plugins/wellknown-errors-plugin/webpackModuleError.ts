import { readFileSync } from 'fs'
import * as path from 'path'
import type { webpack5 as webpack } from 'next/dist/compiled/webpack/webpack'

import { getBabelError } from './parseBabel'
import { getCssError } from './parseCss'
import { getScssError } from './parseScss'
import { getNotFoundError } from './parseNotFoundError'
import { SimpleWebpackError } from './simpleWebpackError'
import isError from '../../../../lib/is-error'

function getFileData(
  compilation: webpack.Compilation,
  m: any
): [string, string | null] {
  let resolved: string
  let ctx: string | null = compilation.compiler?.context ?? null
  if (ctx !== null && typeof m.resource === 'string') {
    const res = path.relative(ctx, m.resource).replace(/\\/g, path.posix.sep)
    resolved = res.startsWith('.') ? res : `.${path.posix.sep}${res}`
  } else {
    const requestShortener = compilation.requestShortener
    if (typeof m?.readableIdentifier === 'function') {
      resolved = m.readableIdentifier(requestShortener)
    } else {
      resolved = m.request ?? m.userRequest
    }
  }

  if (resolved) {
    let content: string | null = null
    try {
      content = readFileSync(
        ctx ? path.resolve(ctx, resolved) : resolved,
        'utf8'
      )
    } catch {}
    return [resolved, content]
  }

  return ['<unknown>', null]
}

export async function getModuleBuildError(
  compilation: webpack.Compilation,
  input: any
): Promise<SimpleWebpackError | false> {
  if (
    !(
      typeof input === 'object' &&
      (input?.name === 'ModuleBuildError' ||
        input?.name === 'ModuleNotFoundError') &&
      Boolean(input.module) &&
      isError(input.error)
    )
  ) {
    return false
  }

  const err: Error = input.error
  const [sourceFilename, sourceContent] = getFileData(compilation, input.module)

  const notFoundError = await getNotFoundError(
    compilation,
    input,
    sourceFilename
  )
  if (notFoundError !== false) {
    return notFoundError
  }

  const babel = getBabelError(sourceFilename, err)
  if (babel !== false) {
    return babel
  }

  const css = getCssError(sourceFilename, err)
  if (css !== false) {
    return css
  }

  const scss = getScssError(sourceFilename, sourceContent, err)
  if (scss !== false) {
    return scss
  }

  return false
}
