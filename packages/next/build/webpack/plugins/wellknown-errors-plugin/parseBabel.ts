import Chalk from 'chalk'
import { SimpleWebpackError } from './simpleWebpackError'

const chalk = new Chalk.constructor({ enabled: true })

export function getBabelError(
  fileName: string,
  err: Error & {
    code?: 'BABEL_PARSE_ERROR'
    loc?: { line: number; column: number }
  }
): SimpleWebpackError | false {
  if (err.code !== 'BABEL_PARSE_ERROR') {
    return false
  }

  // https://github.com/babel/babel/blob/34693d6024da3f026534dd8d569f97ac0109602e/packages/babel-core/src/parser/index.js
  if (err.loc) {
    const lineNumber = Math.max(1, err.loc.line)
    const column = Math.max(1, err.loc.column)

    let message = err.message
      // Remove file information, which instead is provided by webpack.
      .replace(/^.+?: /, '')
      // Remove column information from message
      .replace(
        new RegExp(`[^\\S\\r\\n]*\\(${lineNumber}:${column}\\)[^\\S\\r\\n]*`),
        ''
      )

    return new SimpleWebpackError(
      `${chalk.cyan(fileName)}:${chalk.yellow(
        lineNumber.toString()
      )}:${chalk.yellow(column.toString())}`,
      chalk.red.bold('Syntax error').concat(`: ${message}`)
    )
  }

  return false
}
