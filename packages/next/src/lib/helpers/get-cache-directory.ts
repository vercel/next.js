import os from 'os'
import path from 'path'
import fs from 'fs'

// get platform specific cache directory adapted from playwright's handling
// https://github.com/microsoft/playwright/blob/7d924470d397975a74a19184c136b3573a974e13/packages/playwright-core/src/utils/registry.ts#L141
export function getCacheDirectory(fileDirectory: string, envPath?: string) {
  let result

  if (envPath) {
    result = envPath
  } else {
    let systemCacheDirectory
    if (process.platform === 'linux') {
      systemCacheDirectory =
        process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
    } else if (process.platform === 'darwin') {
      systemCacheDirectory = path.join(os.homedir(), 'Library', 'Caches')
    } else if (process.platform === 'win32') {
      systemCacheDirectory =
        process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    } else {
      /// Attempt to use generic tmp location for un-handled platform
      if (!systemCacheDirectory) {
        for (const dir of [
          path.join(os.homedir(), '.cache'),
          path.join(os.tmpdir()),
        ]) {
          if (fs.existsSync(dir)) {
            systemCacheDirectory = dir
            break
          }
        }
      }

      if (!systemCacheDirectory) {
        console.error(new Error('Unsupported platform: ' + process.platform))
        process.exit(0)
      }
    }
    result = path.join(systemCacheDirectory, fileDirectory)
  }

  if (!path.isAbsolute(result)) {
    // It is important to resolve to the absolute path:
    //   - for unzipping to work correctly;
    //   - so that registry directory matches between installation and execution.
    // INIT_CWD points to the root of `npm/yarn install` and is probably what
    // the user meant when typing the relative path.
    result = path.resolve(process.env['INIT_CWD'] || process.cwd(), result)
  }
  return result
}
