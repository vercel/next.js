/* eslint-disable import/no-extraneous-dependencies */
import * as snackables from 'snackables'

export type Env = snackables.ProcessEnv
export type LoadedEnvFiles = snackables.LoadedEnvFiles

// NOTE: don't reload envs if we already loaded them since this breaks escaped
// environment values e.g. \$ENV_FILE_KEY

export function processEnv(loadedEnvFiles: LoadedEnvFiles) {
  // parses the loadedEnvFiles.contents Buffer which have already been interpolated
  const parsed = snackables.parseCache(loadedEnvFiles)

  /// flag to let snackables know not to reload the parsed cache files
  process.env.PROCESSED_ENV_CACHE = 'true'

  return parsed
}

export function loadEnvConfig(
  dir: string,
  dev?: boolean
): {
  combinedEnv: Env
  loadedEnvFiles: LoadedEnvFiles
} {
  // flag to let snackables know not to reload the same .env file
  process.env.ENV_CACHE = 'true'

  const isTest = process.env.NODE_ENV === 'test'
  const mode = isTest ? 'test' : dev ? 'development' : 'production'

  const { parsed, cachedENVFiles } = snackables.config({
    // root directory for envs
    dir,
    // paths for .env files (can be a single string path, multiple paths as a single
    // separated by commas, or an array of strings)
    path: [
      '.env',
      `.env.${mode}`,
      // Don't include `.env.local` for `test` environment
      // since normally you expect tests to produce the same
      // results for everyone
      mode !== 'test' && `.env.local`,
      `.env.${mode}.local`,
    ].filter(Boolean) as string[],
    // displays messages about loaded ENVs or warnings
    debug: Boolean(process.env.ENV_DEBUG) || true,
  })

  return { combinedEnv: parsed, loadedEnvFiles: cachedENVFiles }
}
