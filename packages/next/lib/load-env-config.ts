import fs from 'fs'
import path from 'path'
import * as log from '../build/output/log'
import dotenvExpand from 'next/dist/compiled/dotenv-expand'
import dotenv, { DotenvConfigOutput } from 'next/dist/compiled/dotenv'

export type Env = { [key: string]: string }

let combinedEnv: Env | undefined = undefined

export function loadEnvConfig(dir: string, dev?: boolean): Env | false {
  // don't reload env if we already have since this breaks escaped
  // environment values e.g. \$ENV_FILE_KEY
  if (combinedEnv) return combinedEnv

  const isTest = process.env.NODE_ENV === 'test'
  const mode = isTest ? 'test' : dev ? 'development' : 'production'
  const dotenvFiles = [
    `.env.${mode}.local`,
    `.env.${mode}`,
    // Don't include `.env.local` for `test` environment
    // since normally you expect tests to produce the same
    // results for everyone
    mode !== 'test' && `.env.local`,
    '.env',
  ].filter(Boolean) as string[]

  combinedEnv = {
    ...(process.env as any),
  } as Env

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
      let result: DotenvConfigOutput = {}
      result.parsed = dotenv.parse(contents)

      result = dotenvExpand(result)

      if (result.parsed) {
        log.info(`Loaded env from ${envFile}`)
      }

      Object.assign(combinedEnv, result.parsed)
    } catch (err) {
      if (err.code !== 'ENOENT') {
        log.error(`Failed to load env from ${envFile}`, err)
      }
    }
  }

  // load global env values prefixed with `NEXT_PUBLIC_` to process.env
  for (const key of Object.keys(combinedEnv)) {
    if (
      key.startsWith('NEXT_PUBLIC_') &&
      typeof process.env[key] === 'undefined'
    ) {
      process.env[key] = combinedEnv[key]
    }
  }

  return combinedEnv
}
