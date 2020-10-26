/* eslint-disable import/no-extraneous-dependencies */
import * as fs from 'fs'
import * as path from 'path'

export type Env = { [key: string]: string }
export type LoadedEnvFiles = Array<{
  path: string
  contents: string
}>
interface ParsedOutput {
  [name: string]: string
}

let combinedEnv: Env | undefined = undefined
let cachedLoadedEnvFiles: LoadedEnvFiles = []

type Log = {
  info: (...args: any[]) => void
  error: (...args: any[]) => void
}

export function parse(src: string | Buffer): ParsedOutput {
  const obj: ParsedOutput = {}
  // const origEnv = Object.assign({}, process.env)

  function interpolate(envValue: string): string {
    const matches = envValue.match(/(.?\${?(?:[a-zA-Z0-9_]+)?}?)/g)
    // should only match ${brackets} => envValue.match(/(.?\${(?:[a-zA-Z0-9_]+)?})/g) ??

    return !matches
      ? envValue
      : matches.reduce((newEnv: string, match: string): string => {
          // parts = ["$string", "@"| ":" | "/", " ", "strippedstring", index: n, input: "$string", groups ]
          const parts = /(.?)\${?([a-zA-Z0-9_]+)?}?/g.exec(match)
          // should only match ${brackets} => /(.?)\${([a-zA-Z0-9_]+)?}/g ??

          /* istanbul ignore next */
          if (!parts) return newEnv

          let value, replacePart

          // if prefix is escaped
          if (parts[1] === '\\') {
            // remove escaped characters
            replacePart = parts[0]
            value = replacePart.replace('\\$', '$')
          } else {
            // else remove prefix character
            replacePart = parts[0].substring(parts[1].length)
            // interpolate value from process or parsed object or empty string
            value = interpolate(process.env[parts[2]] || obj[parts[2]] || '')
          }

          return newEnv.replace(replacePart, value)
        }, envValue)
  }

  // convert Buffers before splitting into lines and processing
  src
    .toString()
    .split(/\n|\r|\r\n/)
    .forEach((line) => {
      // matching "KEY' and 'VAL' in 'KEY=VAL'
      const keyValueArr = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      // matched?
      if (keyValueArr) {
        // default undefined or missing values to empty string
        let value = keyValueArr[2] || ''
        const end = value.length - 1
        const isDoubleQuoted = value[0] === '"' && value[end] === '"'
        const isSingleQuoted = value[0] === "'" && value[end] === "'"

        // if single or double quoted, remove quotes
        if (isSingleQuoted || isDoubleQuoted) {
          value = value.substring(1, end)

          // if double quoted, expand newlines
          if (isDoubleQuoted) value = value.replace(/\\n/g, '\n')
        } else {
          // remove surrounding whitespace
          value = value.trim()
        }

        obj[keyValueArr[1]] = interpolate(value)
      }
    })

  return obj
}

export function processEnv(
  loadedEnvFiles: LoadedEnvFiles,
  dir?: string,
  log: Log = console
) {
  // don't reload env if we already have since this breaks escaped
  // environment values e.g. \$ENV_FILE_KEY
  if (process.env.__NEXT_PROCESSED_ENV || loadedEnvFiles.length === 0) {
    return process.env as Env
  }
  // flag that we processed the environment values in case a serverless
  // function is re-used or we are running in `next start` mode
  process.env.__NEXT_PROCESSED_ENV = 'true'

  const parsed: ParsedOutput = {}

  for (const envFile of loadedEnvFiles) {
    try {
      let result: any = {}
      result = parse(envFile.contents)

      if (result) {
        log.info(`Loaded env from ${path.join(dir || '', envFile.path)}`)
      }

      Object.assign(parsed, result)
    } catch (err) {
      log.error(
        `Failed to load env from ${path.join(dir || '', envFile.path)}`,
        err
      )
    }
  }

  return (process.env = Object.assign({}, parsed, process.env))
}

export function loadEnvConfig(
  dir: string,
  dev?: boolean,
  log: Log = console
): {
  combinedEnv: Env
  loadedEnvFiles: LoadedEnvFiles
} {
  // don't reload env if we already have since this breaks escaped
  // environment values e.g. \$ENV_FILE_KEY
  if (combinedEnv) return { combinedEnv, loadedEnvFiles: cachedLoadedEnvFiles }

  const isTest = process.env.NODE_ENV === 'test'
  const mode = isTest ? 'test' : dev ? 'development' : 'production'
  const dotenvFiles = [
    '.env',
    `.env.${mode}`,
    // Don't include `.env.local` for `test` environment
    // since normally you expect tests to produce the same
    // results for everyone
    mode !== 'test' && `.env.local`,
    `.env.${mode}.local`,
  ].filter(Boolean) as string[]

  for (const envFile of dotenvFiles) {
    // only load .env if the user provided has an env config file
    const dotEnvPath = path.join(dir, envFile)

    try {
      const stats = fs.statSync(dotEnvPath)

      // make sure to only attempt to read files
      if (!stats.isFile()) {
        continue
      }

      const contents = fs.readFileSync(dotEnvPath, 'utf8')
      cachedLoadedEnvFiles.push({
        path: envFile,
        contents,
      })
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log.error(`Failed to load env from ${envFile}`, err)
      }
    }
  }
  combinedEnv = processEnv(cachedLoadedEnvFiles, dir)
  return { combinedEnv, loadedEnvFiles: cachedLoadedEnvFiles }
}
