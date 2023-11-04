import { bold, cyan, green, red, yellow } from '../../../../lib/picocolors'
import { SimpleWebpackError } from './simpleWebpackError'
import { createOriginalStackFrame } from 'next/dist/compiled/@next/react-dev-overlay/dist/middleware'
import type { webpack } from 'next/dist/compiled/webpack/webpack'

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

async function getSourceFrame(
  input: any,
  fileName: any,
  compilation: any
): Promise<{ frame: string; lineNumber: string; column: string }> {
  try {
    const loc = input.loc
      ? input.loc
      : input.dependencies.map((d: any) => d.loc).filter(Boolean)[0]
    const originalSource = input.module.originalSource()

    const result = await createOriginalStackFrame({
      line: loc.start.line,
      column: loc.start.column,
      source: originalSource,
      rootDirectory: compilation.options.context!,
      modulePath: fileName,
      frame: {},
    })

    return {
      frame: result?.originalCodeFrame ?? '',
      lineNumber: result?.originalStackFrame?.lineNumber?.toString() ?? '',
      column: result?.originalStackFrame?.column?.toString() ?? '',
    }
  } catch {
    return { frame: '', lineNumber: '', column: '' }
  }
}

function getFormattedFileName(
  fileName: string,
  module: any,
  lineNumber?: string,
  column?: string
): string {
  if (
    module.loaders?.find((loader: any) =>
      /next-font-loader[/\\]index.js/.test(loader.loader)
    )
  ) {
    // Parse the query and get the path of the file where the font function was called.
    // provided by next-swc next-transform-font
    return JSON.parse(module.resourceResolveData.query.slice(1)).path
  } else {
    let formattedFileName: string = cyan(fileName)
    if (lineNumber && column) {
      formattedFileName += `:${yellow(lineNumber)}:${yellow(column)}`
    }

    return formattedFileName
  }
}

export async function getNotFoundError(
  compilation: webpack.Compilation,
  input: any,
  fileName: string,
  module: any
) {
  if (
    input.name !== 'ModuleNotFoundError' &&
    !(
      input.name === 'ModuleBuildError' &&
      /Error: Can't resolve '.+' in /.test(input.message)
    )
  ) {
    return false
  }

  try {
    const { frame, lineNumber, column } = await getSourceFrame(
      input,
      fileName,
      compilation
    )

    const errorMessage = input.error.message
      .replace(/ in '.*?'/, '')
      .replace(/Can't resolve '(.*)'/, `Can't resolve '${green('$1')}'`)

    const importTrace = () => {
      const moduleTrace = getModuleTrace(input, compilation)
        .map(({ origin }) =>
          origin.readableIdentifier(compilation.requestShortener)
        )
        .filter(
          (name) =>
            name &&
            !/next-(app|middleware|client-pages|route|flight-(client|server|client-entry))-loader\.js/.test(
              name
            ) &&
            !/next-route-loader\/index\.js/.test(name) &&
            !/css-loader.+\.js/.test(name)
        )
      if (moduleTrace.length === 0) return ''

      return `\nImport trace for requested module:\n${moduleTrace.join('\n')}`
    }

    let message =
      red(bold('Module not found')) +
      `: ${errorMessage}` +
      '\n' +
      frame +
      (frame !== '' ? '\n' : '') +
      '\nhttps://nextjs.org/docs/messages/module-not-found\n' +
      importTrace()

    const formattedFileName = getFormattedFileName(
      fileName,
      module,
      lineNumber,
      column
    )

    return new SimpleWebpackError(formattedFileName, message)
  } catch (err) {
    // Don't fail on failure to resolve sourcemaps
    return input
  }
}

export async function getImageError(
  compilation: any,
  input: any,
  err: Error
): Promise<SimpleWebpackError | false> {
  if (err.name !== 'InvalidImageFormatError') {
    return false
  }

  const moduleTrace = getModuleTrace(input, compilation)
  const { origin, module } = moduleTrace[0] || {}
  if (!origin || !module) {
    return false
  }
  const page = origin.rawRequest.replace(/^private-next-pages/, './pages')
  const importedFile = module.rawRequest
  const source = origin.originalSource().buffer().toString('utf8') as string
  let lineNumber = -1
  source.split('\n').some((line) => {
    lineNumber++
    return line.includes(importedFile)
  })
  return new SimpleWebpackError(
    `${cyan(page)}:${yellow(lineNumber.toString())}`,
    red(bold('Error')).concat(
      `: Image import "${importedFile}" is not a valid image file. The image may be corrupted or an unsupported format.`
    )
  )
}
