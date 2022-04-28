import Chalk from 'next/dist/compiled/chalk'
import { SimpleWebpackError } from './simpleWebpackError'
import { createOriginalStackFrame } from 'next/dist/compiled/@next/react-dev-overlay/middleware'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'
import {
  getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage,
  getUnresolvedModuleFromError,
  isEdgeRuntimeCompiled,
} from '../../../utils'
import { NextConfig } from '../../../../server/config-shared'

const chalk = new Chalk.constructor({ enabled: true })

// Based on https://github.com/webpack/webpack/blob/fcdd04a833943394bbb0a9eeb54a962a24cc7e41/lib/stats/DefaultStatsFactoryPlugin.js#L422-L431
/*
Copyright JS Foundation and other contributors

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/
function getModuleTrace(input: any, compilation: any) {
  const visitedModules = new Set()
  const moduleTrace = []
  let current = input.module
  while (current) {
    if (visitedModules.has(current)) break // circular (technically impossible, but who knows)
    visitedModules.add(current)
    const origin = compilation.moduleGraph.getIssuer(current)
    if (!origin) break
    moduleTrace.push({ origin, module: current })
    current = origin
  }

  return moduleTrace
}

export async function getNotFoundError(
  compilation: webpack5.Compilation,
  input: any,
  fileName: string,
  config: NextConfig
) {
  if (input.name !== 'ModuleNotFoundError') {
    return false
  }

  const loc = input.loc
    ? input.loc
    : input.dependencies.map((d: any) => d.loc).filter(Boolean)[0]
  const originalSource = input.module.originalSource()

  try {
    const result = await createOriginalStackFrame({
      line: loc.start.line,
      column: loc.start.column,
      source: originalSource,
      rootDirectory: compilation.options.context!,
      frame: {},
    })

    // If we could not result the original location we still need to show the existing error
    if (!result) {
      return input
    }

    const errorMessage = input.error.message
      .replace(/ in '.*?'/, '')
      .replace(/Can't resolve '(.*)'/, `Can't resolve '${chalk.green('$1')}'`)

    const importTrace = () => {
      const moduleTrace = getModuleTrace(input, compilation)
        .map(({ origin }) =>
          origin.readableIdentifier(compilation.requestShortener)
        )
        .filter(
          (name) =>
            name &&
            !/next-(middleware|client-pages|flight-(client|server))-loader\.js/.test(
              name
            )
        )
      if (moduleTrace.length === 0) return ''

      return `\nImport trace for requested module:\n${moduleTrace.join(
        '\n'
      )}\n\n`
    }

    const frame = result.originalCodeFrame ?? ''

    let message =
      chalk.red.bold('Module not found') +
      `: ${errorMessage}` +
      '\n' +
      frame +
      (frame !== '' ? '\n' : '') +
      importTrace() +
      '\nhttps://nextjs.org/docs/messages/module-not-found'

    const moduleName = getUnresolvedModuleFromError(input.message)
    if (moduleName) {
      if (await isEdgeRuntimeCompiled(compilation, input.module, config)) {
        message +=
          '\n\n' +
          getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage(moduleName)
      }
    }

    return new SimpleWebpackError(
      `${chalk.cyan(fileName)}:${chalk.yellow(
        result.originalStackFrame.lineNumber?.toString() ?? ''
      )}:${chalk.yellow(result.originalStackFrame.column?.toString() ?? '')}`,
      message
    )
  } catch (err) {
    // Don't fail on failure to resolve sourcemaps
    return input
  }
}
