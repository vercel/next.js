import chalk from 'chalk'
import os from 'os'
import path from 'path'

import { FatalError } from '../fatal-error'

export async function getTypeScriptConfiguration(
  ts: typeof import('typescript'),
  tsConfigPath: string,
  metaOnly?: boolean
): Promise<import('typescript').ParsedCommandLine> {
  try {
    const formatDiagnosticsHost: import('typescript').FormatDiagnosticsHost = {
      getCanonicalFileName: (fileName: string) => fileName,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => os.EOL,
    }

    const { config, error } = ts.readConfigFile(tsConfigPath, ts.sys.readFile)
    if (error) {
      throw new FatalError(ts.formatDiagnostic(error, formatDiagnosticsHost))
    }

    let configToParse: any = config

    const result = ts.parseJsonConfigFileContent(
      configToParse,
      // When only interested in meta info,
      // avoid enumerating all files (for performance reasons)
      metaOnly
        ? {
            ...ts.sys,
            readDirectory(_path, extensions, _excludes, _includes, _depth) {
              return [extensions ? `file${extensions[0]}` : `file.ts`]
            },
          }
        : ts.sys,
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
      throw new FatalError(
        ts.formatDiagnostic(result.errors[0], formatDiagnosticsHost)
      )
    }

    return result
  } catch (err) {
    if (err?.name === 'SyntaxError') {
      const reason = '\n' + (err?.message ?? '')
      throw new FatalError(
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
