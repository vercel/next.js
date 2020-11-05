/* eslint-disable import/no-extraneous-dependencies */
import * as snackables from 'snackables'

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
  const { ENV_DIR, ENV_LOAD, ENV_DEBUG, ENV_OVERRIDE, NODE_ENV } = process.env

  const mode = NODE_ENV === 'test' ? 'test' : dev ? 'development' : 'production'

  // parses and extracts .env files where the lower the .env is positioned
  // within the 'path' argument, the more important it is
  // if cache is true and the file has already been loaded, it just returns the process.env
  const { parsed, cachedEnvFiles } = snackables.config({
    // root directory for envs
    dir: ENV_DIR || dir,
    // paths for .env files (can be a single string path, multiple paths
    // as a single string separated by commas, or an array of strings)
    path:
      ENV_LOAD ||
      ([
        '.env',
        `.env.${mode}`,
        // Don't include `.env.local` for `test` environment
        // since normally you expect tests to produce the same
        // results for everyone
        mode !== 'test' && `.env.local`,
        `.env.${mode}.local`,
      ].filter(Boolean) as string[]),
    // overrides Envs already in process.env (default: false)
    override: ENV_OVERRIDE,
    // caches ENV files so that they won't be reloaded
    cache: true,
    // displays messages about loaded ENVs or any warnings
    debug: ENV_DEBUG || true,
  })

  return { combinedEnv: parsed, loadedEnvFiles: cachedEnvFiles }
}
