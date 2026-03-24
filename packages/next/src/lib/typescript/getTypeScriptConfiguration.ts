import { bold, cyan } from '../picocolors'
import os from 'os'
import path from 'path'
import semver from 'next/dist/compiled/semver'

import { FatalError } from '../fatal-error'
import isError from '../is-error'

function resolvePathAliasTarget(baseUrl: string, target: string): string {
  if (
    path.isAbsolute(target) ||
    target.startsWith('./') ||
    target.startsWith('../')
  ) {
    return target
  }

  if (baseUrl === '.' || baseUrl === './') {
    return `./${target}`
  }

  const resolvedTarget = path.join(baseUrl, target)
  if (
    path.isAbsolute(resolvedTarget) ||
    resolvedTarget.startsWith('./') ||
    resolvedTarget.startsWith('../')
  ) {
    return resolvedTarget
  }

  return `./${resolvedTarget}`
}

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
    if (semver.gte(typescript.version, '6.0.0')) {
      const target = configToParse.compilerOptions?.target
      if (
        typeof target === 'string' &&
        (target.toLowerCase() === 'es3' || target.toLowerCase() === 'es5')
      ) {
        const { target: _target, ...restCompilerOptions } =
          configToParse.compilerOptions ?? {}

        // TypeScript 6 deprecates ES3/ES5 targets. Rewrite deprecated
        // targets in-memory to keep typechecking working without requiring
        // `ignoreDeprecations`.
        configToParse = {
          ...configToParse,
          compilerOptions: {
            ...restCompilerOptions,
            target: 'es2015',
          },
        }
      }

      const baseUrl = configToParse.compilerOptions?.baseUrl
      const hasBaseUrl = typeof baseUrl === 'string' && baseUrl.length > 0

      if (hasBaseUrl) {
        const originalPaths = configToParse.compilerOptions?.paths
        const rewrittenPaths: Record<string, unknown> =
          originalPaths && typeof originalPaths === 'object'
            ? Object.fromEntries(
                Object.entries(originalPaths).map(([key, values]) => [
                  key,
                  Array.isArray(values)
                    ? values.map((value) =>
                        typeof value === 'string'
                          ? resolvePathAliasTarget(baseUrl, value)
                          : value
                      )
                    : values,
                ])
              )
            : {
                '*': [resolvePathAliasTarget(baseUrl, '*')],
              }
        if (!Object.prototype.hasOwnProperty.call(rewrittenPaths, '*')) {
          rewrittenPaths['*'] = [resolvePathAliasTarget(baseUrl, '*')]
        }
        const { baseUrl: _baseUrl, ...restCompilerOptions } =
          configToParse.compilerOptions ?? {}

        // TypeScript 6 deprecates `baseUrl`; rewrite aliases to explicit
        // relative paths so path mapping still works without this option.
        configToParse = {
          ...configToParse,
          compilerOptions: {
            ...restCompilerOptions,
            paths: rewrittenPaths,
          },
        }
      }
    }

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
