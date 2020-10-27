/* eslint-disable import/no-extraneous-dependencies */
import * as snackables from 'snackables'

export type Env = snackables.ProcessEnv
export type LoadedEnvFiles = snackables.LoadedEnvFiles

// NOTE: don't reload envs if we already loaded them since this breaks escaped
// environment values e.g. \$ENV_FILE_KEY

export function processEnv(loadedEnvFiles: LoadedEnvFiles) {
  // parses the loadedEnvFiles.contents Buffer which has already been interpolated
  // if PROCESSED_ENV_CACHE is true it just returns the process.env as is
  const parsed = snackables.parse(loadedEnvFiles)

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

  // parses and extracts .env files where the lower the .env is positioned
  // within the 'path' argument, the more important it is
  // if ENV_CACHE is true and the file has already been loaded, it just returns the process.env
  const { parsed, cachedEnvFiles } = snackables.config({
    // root directory for envs
    dir,
    // paths for .env files (can be a single string path, multiple paths
    // as a single string separated by commas, or an array of strings)
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

  return { combinedEnv: parsed, loadedEnvFiles: cachedEnvFiles }
}
