/* eslint-disable import/no-extraneous-dependencies */
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { expand as dotenvExpand } from 'dotenv-expand'

export type Env = { [key: string]: string | undefined }
export type LoadedEnvFiles = Array<{
  path: string
  contents: string
  env: Env
}>

export let initialEnv: Env | undefined = undefined
let combinedEnv: Env | undefined = undefined
let parsedEnv: Env | undefined = undefined
let cachedLoadedEnvFiles: LoadedEnvFiles = []
let previousLoadedEnvFiles: LoadedEnvFiles = []

export function updateInitialEnv(newEnv: Env) {
  Object.assign(initialEnv || {}, newEnv)
}

type Log = {
  info: (...args: any[]) => void
  error: (...args: any[]) => void
}

function replaceProcessEnv(sourceEnv: Env) {
  Object.keys(process.env).forEach((key) => {
    // Allow mutating internal Next.js env variables after the server has initiated.
    // This is necessary for dynamic things like the IPC server port.
    if (!key.startsWith('__NEXT_PRIVATE')) {
      if (sourceEnv[key] === undefined || sourceEnv[key] === '') {
        delete process.env[key]
      }
    }
  })

  Object.entries(sourceEnv).forEach(([key, value]) => {
    process.env[key] = value
  })
}

export function processEnv(
  loadedEnvFiles: LoadedEnvFiles,
  dir?: string,
  log: Log = console,
  forceReload = false,
  onReload?: (envFilePath: string) => void
) {
  if (!initialEnv) {
    initialEnv = Object.assign({}, process.env)
  }
  // only reload env when forceReload is specified
  if (
    !forceReload &&
    (process.env.__NEXT_PROCESSED_ENV || loadedEnvFiles.length === 0)
  ) {
    return [process.env as Env]
  }
  // flag that we processed the environment values already.
  process.env.__NEXT_PROCESSED_ENV = 'true'

  const origEnv = Object.assign({}, initialEnv)
  const parsed: dotenv.DotenvParseOutput = {}

  for (const envFile of loadedEnvFiles) {
    try {
      let result: dotenv.DotenvConfigOutput = {}
      result.parsed = dotenv.parse(envFile.contents)

      result = dotenvExpand(result)

      if (
        result.parsed &&
        !previousLoadedEnvFiles.some(
          (item) =>
            item.contents === envFile.contents && item.path === envFile.path
        )
      ) {
        onReload?.(envFile.path)
      }

      for (const key of Object.keys(result.parsed || {})) {
        if (
          typeof parsed[key] === 'undefined' &&
          typeof origEnv[key] === 'undefined'
        ) {
          // We're being imprecise in the type system - assume parsed[key] can be undefined
          // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
          parsed[key] = result.parsed?.[key]!
        }
      }

      // Add the parsed env to the loadedEnvFiles
      envFile.env = result.parsed || {}
    } catch (err) {
      log.error(
        `Failed to load env from ${path.join(dir || '', envFile.path)}`,
        err
      )
    }
  }
  return [Object.assign(process.env, parsed), parsed]
}

export function resetEnv() {
  if (initialEnv) {
    replaceProcessEnv(initialEnv)
  }
}

export function loadEnvConfig(
  dir: string,
  dev?: boolean,
  log: Log = console,
  forceReload = false,
  onReload?: (envFilePath: string) => void
): {
  combinedEnv: Env
  parsedEnv: Env | undefined
  loadedEnvFiles: LoadedEnvFiles
} {
  if (!initialEnv) {
    initialEnv = Object.assign({}, process.env)
  }
  // only reload env when forceReload is specified
  if (combinedEnv && !forceReload) {
    return { combinedEnv, parsedEnv, loadedEnvFiles: cachedLoadedEnvFiles }
  }
  replaceProcessEnv(initialEnv)
  previousLoadedEnvFiles = cachedLoadedEnvFiles
  cachedLoadedEnvFiles = []

  const isTest = process.env.NODE_ENV === 'test'
  const mode = isTest ? 'test' : dev ? 'development' : 'production'
  const dotenvFiles = [
    `.env.${mode}.local`,
    // Don't include `.env.local` for `test` environment
    // since normally you expect tests to produce the same
    // results for everyone
    mode !== 'test' && `.env.local`,
    `.env.${mode}`,
    '.env',
  ].filter(Boolean) as string[]

  for (const envFile of dotenvFiles) {
    // only load .env if the user provided has an env config file
    const dotEnvPath = path.join(dir, envFile)

    try {
      const stats = fs.statSync(dotEnvPath)

      // make sure to only attempt to read files or named pipes
      if (!stats.isFile() && !stats.isFIFO()) {
        continue
      }

      const contents = fs.readFileSync(dotEnvPath, 'utf8')
      cachedLoadedEnvFiles.push({
        path: envFile,
        contents,
        env: {}, // This will be populated in processEnv
      })
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        log.error(`Failed to load env from ${envFile}`, err)
      }
    }
  }
  ;[combinedEnv, parsedEnv] = processEnv(
    cachedLoadedEnvFiles,
    dir,
    log,
    forceReload,
    onReload
  )
  return { combinedEnv, parsedEnv, loadedEnvFiles: cachedLoadedEnvFiles }
}
