import chalk from 'chalk'
import os from 'os'
import path from 'path'
import { FatalTypeScriptError } from './FatalTypeScriptError'

export async function getTypeScriptConfiguration(
  ts: typeof import('typescript'),
  tsConfigPath: string
): Promise<import('typescript').ParsedCommandLine> {
  try {
    const formatDiagnosticsHost: import('typescript').FormatDiagnosticsHost = {
      getCanonicalFileName: (fileName: string) => fileName,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => os.EOL,
    }

    const { config, error } = ts.readConfigFile(tsConfigPath, ts.sys.readFile)
    if (error) {
      throw new FatalTypeScriptError(
        ts.formatDiagnostic(error, formatDiagnosticsHost)
      )
    }

    const result = ts.parseJsonConfigFileContent(
      config,
      ts.sys,
      path.dirname(tsConfigPath)
    )

    if (result.errors) {
      result.errors = result.errors.filter(
        ({ code }) =>
          // No inputs were found in config file
          code !== 18003
      )
    }

    if (result.errors?.length) {
      throw new FatalTypeScriptError(
        ts.formatDiagnostic(result.errors[0], formatDiagnosticsHost)
      )
    }

    return result
  } catch (err) {
    if (err?.name === 'SyntaxError') {
      const reason = '\n' + (err?.message ?? '')
      throw new FatalTypeScriptError(
        chalk.red.bold(
          'Could not parse',
          chalk.cyan('tsconfig.json') +
            '.' +
            ' Please make sure it contains syntactically correct JSON.'
        ) + reason
      )
    }
    throw err
  }
}
