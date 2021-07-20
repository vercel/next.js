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

export interface LintResult {
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
): {
  output: string
  nextPluginErrorCount: number
  nextPluginWarningCount: number
} {
  let fileName = path.posix.normalize(
    path.relative(dir, filePath).replace(/\\/g, '/')
  )

  if (!fileName.startsWith('.')) {
    fileName = './' + fileName
  }

  let output = '\n' + chalk.cyan(fileName)
  let nextPluginWarningCount = 0
  let nextPluginErrorCount = 0

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

    if (ruleId?.includes('@next/next')) {
      if (severity === MessageSeverity.Warning) {
        nextPluginWarningCount += 1
      } else {
        nextPluginErrorCount += 1
      }
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

  return {
    output,
    nextPluginErrorCount,
    nextPluginWarningCount,
  }
}

export function formatResults(
  baseDir: string,
  results: LintResult[]
): {
  output: string
  totalNextPluginErrorCount: number
  totalNextPluginWarningCount: number
} {
  let totalNextPluginErrorCount = 0
  let totalNextPluginWarningCount = 0

  const formattedResults = results
    .filter(({ messages }) => messages?.length)
    .map(({ messages, filePath }) => {
      const res = formatMessage(baseDir, messages, filePath)
      totalNextPluginErrorCount += res.nextPluginErrorCount
      totalNextPluginWarningCount += res.nextPluginWarningCount
      return res.output
    })
    .join('\n')

  return {
    output:
      formattedResults.length > 0
        ? formattedResults +
          `\n\n${chalk.bold(
            'Need to disable some ESLint rules? Learn more here:'
          )} https://nextjs.org/docs/basic-features/eslint#disabling-rules\n`
        : '',
    totalNextPluginErrorCount,
    totalNextPluginWarningCount,
  }
}
