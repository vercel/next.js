/* eslint-disable import/no-extraneous-dependencies */
import * as snackables from 'snackables-next'

export type Env = snackables.ProcessEnv
export type LoadedEnvFiles = snackables.CachedEnvFiles

// NOTE: don't reload envs if we already loaded them since this breaks escaped
// environment values e.g. \$ENV_FILE_KEY

export function processEnv(loadedEnvFiles: LoadedEnvFiles) {
  // parses the loadedEnvFiles.contents Buffer which has already been interpolated
  // if LOADED_CACHE is true it just returns the process.env as is
  const parsed = snackables.parse(loadedEnvFiles)

  /// flag to let snackables know not to reload the parsed cache files
  process.env.LOADED_CACHE = 'true'

  return parsed
}

export function loadEnvConfig(
  dir: string,
  dev?: boolean
): {
  combinedEnv: Env
  loadedEnvFiles: LoadedEnvFiles
} {
  const mode =
    process.env.NODE_ENV === 'test'
      ? 'test'
      : dev
      ? 'development'
      : 'production'

  // reads, parses, extracts and assigns .env files
  const { parsed, cachedEnvFiles } = snackables.config({
    // root directory for .env files
    dir,
    // paths for .env files -- file importance is determined by the greater array index
    paths: [
      '.env',
      `.env.${mode}`,
      // Don't include `.env.local` for `test` environment
      // since normally you expect tests to produce the same
      // results for everyone
      mode !== 'test' && `.env.local`,
      `.env.${mode}.local`,
    ].filter(Boolean) as string[],
    // caches .env files that have already been loaded
    // attempts to reload the same .env file will be skipped
    cache: true,
    // displays messages about loaded .envs
    debug: true,
  })

  return { combinedEnv: parsed, loadedEnvFiles: cachedEnvFiles }
}
