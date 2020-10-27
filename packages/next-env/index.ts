/* eslint-disable import/no-extraneous-dependencies */
import * as snackables from 'snackables'

export type Env = snackables.ProcessEnv
export type LoadedEnvFiles = snackables.ENVFiles

export function processEnv(loadedEnvFiles: LoadedEnvFiles) {
  // don't reload env if we already have since this breaks escaped
  // environment values e.g. \$ENV_FILE_KEY
  if (process.env.__NEXT_PROCESSED_ENV || !loadedEnvFiles.length) {
    return process.env as Env
  }
  // flag that we processed the environment values in case a serverless
  // function is re-used or we are running in `next start` mode
  process.env.__NEXT_PROCESSED_ENV = 'true'

  return snackables.parse(loadedEnvFiles)
}

export function loadEnvConfig(
  dir: string,
  dev?: boolean
): {
  combinedEnv: Env
  loadedEnvFiles: LoadedEnvFiles
} {
  // don't reload env if we already have it loaded since this breaks escaped
  // environment values e.g. \$ENV_FILE_KEY
  const cachedENVs = snackables.getCache()
  if (cachedENVs.length > 0) {
    return { combinedEnv: process.env as Env, loadedEnvFiles: cachedENVs }
  }

  // flag to let snackables know not to reload the same .env file
  process.env.ENV_CACHE = 'true'

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

  const { parsed, cachedENVFiles } = snackables.config({
    dir,
    path: dotenvFiles,
    debug: Boolean(process.env.ENV_DEBUG) || true,
  })

  return { combinedEnv: parsed, loadedEnvFiles: cachedENVFiles }
}
