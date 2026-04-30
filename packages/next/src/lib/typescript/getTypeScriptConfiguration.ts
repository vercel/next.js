import { bold, cyan } from '../picocolors'
import os from 'os'
import path from 'path'

import { FatalError } from '../fatal-error'
import isError from '../is-error'

export async function getTypeScriptConfiguration(
  typescript: typeof import('typescript'),
  tsConfigPath: string,
  metaOnly?: boolean
): Promise<import('typescript').ParsedCommandLine> {
  try {
    const formatDiagnosticsHost: import('typescript').FormatDiagnosticsHost = {
      getCanonicalFileName: (fileName: string) => fileName,
      getCurrentDirectory: typescript.sys.getCurrentDirectory,
      getNewLine: () => os.EOL,
    }

    const { config, error } = typescript.readConfigFile(
      tsConfigPath,
      typescript.sys.readFile
    )
    if (error) {
      throw new FatalError(
        typescript.formatDiagnostic(error, formatDiagnosticsHost)
      )
    }

    let configToParse: any = config

    const result = typescript.parseJsonConfigFileContent(
      configToParse,
      // When only interested in meta info,
      // avoid enumerating all files (for performance reasons)
      metaOnly
        ? {
            ...typescript.sys,
            readDirectory(_path, extensions, _excludes, _includes, _depth) {
              return [extensions ? `file${extensions[0]}` : `file.ts`]
            },
          }
        : typescript.sys,
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
        typescript.formatDiagnostic(result.errors[0], formatDiagnosticsHost)
      )
    }

    return result
  } catch (err) {
    if (isError(err) && err.name === 'SyntaxError') {
      const reason = '\n' + (err.message ?? '')
      throw new FatalError(
        bold(
          'Could not parse' +
            cyan('tsconfig.json') +
            '.' +
            ' Please make sure it contains syntactically correct JSON.'
        ) + reason
      )
    }
    throw err
  }
}
