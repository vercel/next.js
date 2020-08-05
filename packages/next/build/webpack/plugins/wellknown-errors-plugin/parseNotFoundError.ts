import Chalk from 'next/dist/compiled/chalk'
import { SimpleWebpackError } from './simpleWebpackError'
import { createOriginalStackFrame } from '@next/react-dev-overlay/lib/middleware'

const chalk = new Chalk.constructor({ enabled: true })

export async function getNotFoundError(
  compilation: any,
  input: any,
  fileName: string
) {
  if (input.name !== 'ModuleNotFoundError') {
    return false
  }

  const loc = input.dependencies.map((d: any) => d.loc).filter(Boolean)[0]
  const originalSource = input.origin.originalSource()

  try {
    const result = await createOriginalStackFrame({
      line: loc.start.line,
      column: loc.start.column,
      source: originalSource,
      rootDirectory: compilation.options.context,
      frame: {},
    })

    // If we could not result the original location we still need to show the existing error
    if (!result) {
      return input
    }

    const errorMessage = input.error.message.replace(/ in '.*?'/, '')

    const message = errorMessage + '\n' + result.originalCodeFrame

    return new SimpleWebpackError(
      `${chalk.cyan(fileName)}:${chalk.yellow(
        result.originalStackFrame.lineNumber?.toString() ?? ''
      )}:${chalk.yellow(result.originalStackFrame.column?.toString() ?? '')}`,
      message
    )
  } catch (err) {
    console.log('Failed to parse source map:', err)
    // Don't fail on failure to resolve sourcemaps
    return input
  }
}
