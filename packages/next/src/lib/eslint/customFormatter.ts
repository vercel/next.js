import { bold, cyan, gray, red, yellow } from '../picocolors'
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

function pluginCount(messages: LintMessage[]): {
  nextPluginErrorCount: number
  nextPluginWarningCount: number
} {
  let nextPluginWarningCount = 0
  let nextPluginErrorCount = 0

  for (let i = 0; i < messages.length; i++) {
    const { severity, ruleId } = messages[i]

    if (ruleId?.includes('@next/next')) {
      if (severity === MessageSeverity.Warning) {
        nextPluginWarningCount += 1
      } else {
        nextPluginErrorCount += 1
      }
    }
  }

  return {
    nextPluginErrorCount,
    nextPluginWarningCount,
  }
}

function formatMessage(
  dir: string,
  messages: LintMessage[],
  filePath: string
): string {
  let fileName = path.posix.normalize(
    path.relative(dir, filePath).replace(/\\/g, '/')
  )

  if (!fileName.startsWith('.')) {
    fileName = './' + fileName
  }

  let output = '\n' + cyan(fileName)

  for (let i = 0; i < messages.length; i++) {
    const { message, severity, line, column, ruleId } = messages[i]

    output = output + '\n'

    if (line && column) {
      output =
        output +
        yellow(line.toString()) +
        ':' +
        yellow(column.toString()) +
        '  '
    }

    if (severity === MessageSeverity.Warning) {
      output += yellow(bold('Warning')) + ': '
    } else {
      output += red(bold('Error')) + ': '
    }

    output += message

    if (ruleId) {
      output += '  ' + gray(bold(ruleId))
    }
  }

  return output
}

export async function formatResults(
  baseDir: string,
  results: LintResult[],
  format: (r: LintResult[]) => string | Promise<string>
): Promise<{
  output: string
  outputWithMessages: string
  totalNextPluginErrorCount: number
  totalNextPluginWarningCount: number
}> {
  let totalNextPluginErrorCount = 0
  let totalNextPluginWarningCount = 0
  let resultsWithMessages = results.filter(({ messages }) => messages?.length)

  // Track number of Next.js plugin errors and warnings
  resultsWithMessages.forEach(({ messages }) => {
    const res = pluginCount(messages)
    totalNextPluginErrorCount += res.nextPluginErrorCount
    totalNextPluginWarningCount += res.nextPluginWarningCount
  })

  // Use user defined formatter or Next.js's built-in custom formatter
  const output = format
    ? await format(resultsWithMessages)
    : resultsWithMessages
        .map(({ messages, filePath }) =>
          formatMessage(baseDir, messages, filePath)
        )
        .join('\n')

  return {
    output: output,
    outputWithMessages:
      resultsWithMessages.length > 0
        ? output +
          `\n\n${cyan(
            'info'
          )}  - Need to disable some ESLint rules? Learn more here: https://nextjs.org/docs/app/api-reference/config/eslint#disabling-rules`
        : '',
    totalNextPluginErrorCount,
    totalNextPluginWarningCount,
  }
}
