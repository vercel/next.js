import chalk from 'chalk'
import path from 'path'

// eslint-disable-next-line no-shadow
export enum MessageSeverity {
  Warning = 1,
  Error = 2,
}

interface LintMessage {
  ruleId: string | null
  severity: 1 | 2
  message: string
  line: number
  column: number
}

interface LintResult {
  filePath: string
  messages: LintMessage[]
  errorCount: number
  warningCount: number
  output?: string
  source?: string
}

function formatMessage(
  dir: string,
  messages: LintMessage[],
  filePath: string
): string | void {
  let fileName = path.posix.normalize(
    path.relative(dir, filePath).replace(/\\/g, '/')
  )

  if (!fileName.startsWith('.')) {
    fileName = './' + fileName
  }

  let output = '\n' + chalk.cyan(fileName)

  for (let i = 0; i < messages.length; i++) {
    const { message, severity, line, column, ruleId } = messages[i]

    output = output + '\n'

    if (line && column) {
      output =
        output +
        chalk.yellow(line.toString()) +
        ':' +
        chalk.yellow(column.toString()) +
        '  '
    }

    if (severity === MessageSeverity.Warning) {
      output += chalk.yellow.bold('Warning') + ': '
    } else {
      output += chalk.red.bold('Error') + ': '
    }

    output += message

    if (ruleId) {
      output += '  ' + chalk.gray.bold(ruleId)
    }
  }

  return output
}

export function formatResults(baseDir: string, results: LintResult[]): string {
  return (
    results
      .filter(({ messages }) => messages?.length)
      .map(({ messages, filePath }) =>
        formatMessage(baseDir, messages, filePath)
      )
      .join('\n') + '\n'
  )
}
