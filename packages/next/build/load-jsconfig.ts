import path from 'path'
import { fileExists } from '../lib/file-exists'
import { NextConfigComplete } from '../server/config-shared'
import * as Log from './output/log'
import { getTypeScriptConfiguration } from '../lib/typescript/getTypeScriptConfiguration'
import { readFileSync } from 'fs'
import isError from '../lib/is-error'

let TSCONFIG_WARNED = false

function parseJsonFile(filePath: string) {
  const JSON5 = require('next/dist/compiled/json5')
  const contents = readFileSync(filePath, 'utf8')

  // Special case an empty file
  if (contents.trim() === '') {
    return {}
  }

  try {
    return JSON5.parse(contents)
  } catch (err) {
    if (!isError(err)) throw err
    const { codeFrameColumns } = require('next/dist/compiled/babel/code-frame')
    const codeFrame = codeFrameColumns(
      String(contents),
      {
        start: {
          line: (err as Error & { lineNumber?: number }).lineNumber || 0,
          column: (err as Error & { columnNumber?: number }).columnNumber || 0,
        },
      },
      { message: err.message, highlightCode: true }
    )
    throw new Error(`Failed to parse "${filePath}":\n${codeFrame}`)
  }
}

export default async function loadJsConfig(
  dir: string,
  config: NextConfigComplete
) {
  let typeScriptPath: string | undefined
  try {
    typeScriptPath = require.resolve('typescript', { paths: [dir] })
  } catch (_) {}
  const tsConfigPath = path.join(dir, config.typescript.tsconfigPath)
  const useTypeScript = Boolean(
    typeScriptPath && (await fileExists(tsConfigPath))
  )

  let jsConfig
  // jsconfig is a subset of tsconfig
  if (useTypeScript) {
    if (
      config.typescript.tsconfigPath !== 'tsconfig.json' &&
      TSCONFIG_WARNED === false
    ) {
      TSCONFIG_WARNED = true
      Log.info(`Using tsconfig file: ${config.typescript.tsconfigPath}`)
    }

    const ts = (await Promise.resolve(
      require(typeScriptPath!)
    )) as typeof import('typescript')
    const tsConfig = await getTypeScriptConfiguration(ts, tsConfigPath, true)
    jsConfig = { compilerOptions: tsConfig.options }
  }

  const jsConfigPath = path.join(dir, 'jsconfig.json')
  if (!useTypeScript && (await fileExists(jsConfigPath))) {
    jsConfig = parseJsonFile(jsConfigPath)
  }

  let resolvedBaseUrl
  if (jsConfig?.compilerOptions?.baseUrl) {
    resolvedBaseUrl = path.resolve(dir, jsConfig.compilerOptions.baseUrl)
  }
  return {
    useTypeScript,
    jsConfig,
    resolvedBaseUrl,
  }
}
