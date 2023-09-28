import { bold, cyan, red, yellow } from '../../../../lib/picocolors'
import { SimpleWebpackError } from './simpleWebpackError'

const regexScssError =
  /SassError: (.+)\n\s+on line (\d+) [\s\S]*?>> (.+)\n\s*(-+)\^$/m

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
        const {
          codeFrameColumns,
        } = require('next/dist/compiled/babel/code-frame')
        frame = codeFrameColumns(
          fileContent,
          { start: { line: lineNumber, column } },
          { forceColor: true }
        ) as string
      } catch {}
    }

    return new SimpleWebpackError(
      `${cyan(fileName)}:${yellow(lineNumber.toString())}:${yellow(
        column.toString()
      )}`,
      red(bold('Syntax error')).concat(`: ${reason}\n\n${frame ?? backupFrame}`)
    )
  }

  return false
}
