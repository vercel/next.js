import path from 'path'
import fs from 'fs'
import type { NextConfigComplete } from '../server/config-shared'
import * as Log from './output/log'
import { getTypeScriptConfiguration } from '../lib/typescript/getTypeScriptConfiguration'
import { readFileSync } from 'fs'
import isError from '../lib/is-error'
import { codeFrameColumns } from '../shared/lib/errors/code-frame'
import {
  getTypeScriptApiMissingError,
  getTypeScriptConfigurationCli,
  getTypeScriptPackageInfo,
  hasNativeTypeScriptPreview,
} from '../lib/typescript/runTypeScriptCli'
import { loadTsConfigOptions } from '../lib/typescript/loadTsConfig'

let TSCONFIG_WARNED = false

export function parseJsonFile(filePath: string) {
  const JSON5 =
    require('next/dist/compiled/json5') as typeof import('next/dist/compiled/json5')
  const contents = readFileSync(filePath, 'utf8')

  // Special case an empty file
  if (contents.trim() === '') {
    return {}
  }

  try {
    return JSON5.parse(contents)
  } catch (err) {
    if (!isError(err)) throw err
    const codeFrame = codeFrameColumns(
      String(contents),
      {
        start: {
          line: (err as Error & { lineNumber?: number }).lineNumber || 1,
          column:
            (err as Error & { columnNumber?: number }).columnNumber ||
            undefined,
        },
      },
      { message: err.message, color: true }
    )
    throw new Error(
      `Failed to parse "${filePath}":\n${codeFrame ?? err.message}`
    )
  }
}

export type ResolvedBaseUrl =
  | { baseUrl: string; isImplicit: boolean }
  | undefined

export type JsConfig = { compilerOptions: Record<string, any> } | undefined

export default async function loadJsConfig(
  dir: string,
  config: NextConfigComplete
): Promise<{
  useTypeScript: boolean
  jsConfig: JsConfig
  jsConfigPath?: string
  resolvedBaseUrl: ResolvedBaseUrl
}> {
  const useTypeScriptCli = Boolean(config.experimental.useTypeScriptCli)
  const typeScriptPackage = getTypeScriptPackageInfo(dir)
  const typeScriptPath = useTypeScriptCli
    ? typeScriptPackage?.tscPath
    : typeScriptPackage?.apiPath
  const tsConfigFileName = config.typescript.tsconfigPath || 'tsconfig.json'
  const tsConfigPath = path.join(dir, tsConfigFileName)

  if (
    !useTypeScriptCli &&
    typeScriptPackage &&
    !typeScriptPackage.apiPath &&
    !hasNativeTypeScriptPreview(dir) &&
    fs.existsSync(tsConfigPath)
  ) {
    throw getTypeScriptApiMissingError(typeScriptPackage.version)
  }

  const useTypeScript = Boolean(typeScriptPath && fs.existsSync(tsConfigPath))

  let implicitBaseurl
  let jsConfig: { compilerOptions: Record<string, any> } | undefined
  // jsconfig is a subset of tsconfig
  if (useTypeScript) {
    if (tsConfigFileName !== 'tsconfig.json' && TSCONFIG_WARNED === false) {
      TSCONFIG_WARNED = true
      Log.info(`Using tsconfig file: ${tsConfigFileName}`)
    }

    if (useTypeScriptCli) {
      const tsConfig = await getTypeScriptConfigurationCli({
        baseDir: dir,
        tsConfigPath,
        tscPath: typeScriptPath!,
      })
      const configOrigins = loadTsConfigOptions(tsConfigPath)
      jsConfig = {
        compilerOptions: {
          ...tsConfig.compilerOptions,
          pathsBasePath: configOrigins.pathsBasePath,
        },
      }
    } else {
      const ts = (await Promise.resolve(
        require(typeScriptPath!)
      )) as typeof import('typescript')
      const tsConfig = await getTypeScriptConfiguration(ts, tsConfigPath, true)
      jsConfig = { compilerOptions: tsConfig.options }
    }
    implicitBaseurl = path.dirname(tsConfigPath)
  }

  const jsConfigPath = path.join(dir, 'jsconfig.json')
  if (!useTypeScript && fs.existsSync(jsConfigPath)) {
    jsConfig = parseJsonFile(jsConfigPath)
    implicitBaseurl = path.dirname(jsConfigPath)
  }

  let resolvedBaseUrl: ResolvedBaseUrl
  if (jsConfig?.compilerOptions?.baseUrl) {
    resolvedBaseUrl = {
      baseUrl: path.resolve(
        implicitBaseurl ?? dir,
        jsConfig.compilerOptions.baseUrl
      ),
      isImplicit: false,
    }
  } else {
    // TypeScript 5.0+: `pathsBasePath` is the directory of the tsconfig that
    // defines `paths`. For paths inherited from an extended base tsconfig (e.g.
    // a workspace-root tsconfig.base.json for nx monorepo), this is the base
    // config's directory — not the app tsconfig dir. Using it ensures JsConfigPathsPlugin
    // joins path-mapping values against the correct base so `baseUrl` is not required
    // for path aliases to work in webpack.
    const pathsBasePath: string | undefined =
      jsConfig?.compilerOptions?.pathsBasePath
    const effectiveBaseUrl = pathsBasePath ?? implicitBaseurl
    if (effectiveBaseUrl) {
      resolvedBaseUrl = {
        baseUrl: effectiveBaseUrl,
        isImplicit: true,
      }
    }
  }

  return {
    useTypeScript,
    jsConfig,
    resolvedBaseUrl,
    jsConfigPath: useTypeScript
      ? tsConfigPath
      : fs.existsSync(jsConfigPath)
        ? jsConfigPath
        : undefined,
  }
}
