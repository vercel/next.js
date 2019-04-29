import fs from 'fs'
import os from 'os'
import chalk from 'chalk'
import { codeFrameColumns as codeFrame } from '@babel/code-frame'

const types: any = { diagnostic: 'TypeScript', lint: 'TSLint' }

export default function formatter(message: any, useColors: boolean) {
  const { type, severity, file, line, content, code, character } =
    typeof message.getFile === 'function'
      ? {
          type: message.getType(),
          severity: message.getSeverity(),
          file: message.getFile(),
          line: message.getLine(),
          content: message.getContent(),
          code: message.getCode(),
          character: message.getCharacter(),
        }
      : message

  const colors = new chalk.constructor({ enabled: useColors })
  const messageColor = message.isWarningSeverity() ? colors.yellow : colors.red
  const fileAndNumberColor = colors.bold.cyan

  const source = file && fs.existsSync(file) && fs.readFileSync(file, 'utf-8')
  const frame = source
    ? codeFrame(
        source,
        { start: { line, column: character } },
        { highlightCode: useColors },
      )
        .split('\n')
        .map((str: string) => '  ' + str)
        .join(os.EOL)
    : ''

  return [
    messageColor.bold(`${types[type]} ${severity.toLowerCase()} in `) +
      fileAndNumberColor(`${file}(${line},${character})`) +
      messageColor(':'),
    content +
      '  ' +
      messageColor.underline((type === 'lint' ? 'Rule: ' : 'TS') + code),
    '',
    frame,
  ].join(os.EOL)
}
