import Chalk from 'next/dist/compiled/chalk'
import { SimpleWebpackError } from './simpleWebpackError'

const regexCssError =
  /^(?:CssSyntaxError|SyntaxError)\n\n\((\d+):(\d*)\) (.*)$/s

export function getCssError(
  fileName: string,
  err: Error
): SimpleWebpackError | false {
  if (
    !(
      (err.name === 'CssSyntaxError' || err.name === 'SyntaxError') &&
      (err as any).stack === false &&
      !(err instanceof SyntaxError)
    )
  ) {
    return false
  }

  // https://github.com/postcss/postcss-loader/blob/d6931da177ac79707bd758436e476036a55e4f59/src/Error.js

  const res = regexCssError.exec(err.message)
  if (res) {
    const [, _lineNumber, _column, reason] = res
    const lineNumber = Math.max(1, parseInt(_lineNumber, 10))
    const column = Math.max(1, parseInt(_column, 10))

    return new SimpleWebpackError(
      `${Chalk.cyan(fileName)}:${Chalk.yellow(
        lineNumber.toString()
      )}:${Chalk.yellow(column.toString())}`,
      Chalk.red.bold('Syntax error').concat(`: ${reason}`)
    )
  }

  return false
}
