import { codeFrameColumns } from 'next/dist/compiled/babel/code-frame'
import chalk from 'chalk'
import path from 'path'

export enum DiagnosticCategory {
  Warning = 0,
  Error = 1,
  Suggestion = 2,
  Message = 3,
}

export async function getFormattedDiagnostic(
  ts: typeof import('typescript'),
  baseDir: string,
  diagnostic: import('typescript').Diagnostic
): Promise<string> {
  let message = ''

  const reason = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  const category = diagnostic.category
  switch (category) {
    // Warning
    case DiagnosticCategory.Warning: {
      message += chalk.yellow.bold('Type warning') + ': '
      break
    }
    // Error
    case DiagnosticCategory.Error: {
      message += chalk.red.bold('Type error') + ': '
      break
    }
    // 2 = Suggestion, 3 = Message
    case DiagnosticCategory.Suggestion:
    case DiagnosticCategory.Message:
    default: {
      message += chalk.cyan.bold(category === 2 ? 'Suggestion' : 'Info') + ': '
      break
    }
  }
  message += reason + '\n'

  if (diagnostic.file) {
    const pos = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!)
    const line = pos.line + 1
    const character = pos.character + 1

    let fileName = path.posix.normalize(
      path.relative(baseDir, diagnostic.file.fileName).replace(/\\/, '/')
    )
    if (!fileName.startsWith('.')) {
      fileName = './' + fileName
    }

    message =
      chalk.cyan(fileName) +
      ':' +
      chalk.yellow(line.toString()) +
      ':' +
      chalk.yellow(character.toString()) +
      '\n' +
      message

    message +=
      '\n' +
      codeFrameColumns(
        diagnostic.file.getFullText(diagnostic.file.getSourceFile()),
        {
          start: { line: line, column: character },
        },
        { forceColor: true }
      )
  }

  return message
}
