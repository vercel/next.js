import { codeFrameColumns } from 'next/dist/compiled/babel/code-frame'
import Chalk from 'chalk'
import { SimpleWebpackError } from './simpleWebpackError'

const chalk = new Chalk.constructor({ enabled: true })
const regexScssError = /SassError: (.+)\n\s+on line (\d+) [\s\S]*?>> (.+)\n\s*(-+)\^$/m

export function getScssError(
  fileName: string,
  fileContent: string | null,
  err: Error
): SimpleWebpackError | false {
  if (err.name !== 'SassError') {
    return false
  }

  const res = regexScssError.exec(err.message)
  if (res) {
    const [, reason, _lineNumer, backupFrame, columnString] = res
    const lineNumber = Math.max(1, parseInt(_lineNumer, 10))
    const column = columnString?.length ?? 1

    let frame: string | undefined
    if (fileContent) {
      try {
        frame = codeFrameColumns(
          fileContent,
          { start: { line: lineNumber, column } },
          { forceColor: true }
        ) as string
      } catch {}
    }

    return new SimpleWebpackError(
      `${chalk.cyan(fileName)}:${chalk.yellow(
        lineNumber.toString()
      )}:${chalk.yellow(column.toString())}`,
      chalk.red
        .bold('Syntax error')
        .concat(`: ${reason}\n\n${frame ?? backupFrame}`)
    )
  }

  return false
}
