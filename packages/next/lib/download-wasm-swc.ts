import os from 'os'
import fs from 'fs'
import path from 'path'
import * as Log from '../build/output/log'
import { execSync } from 'child_process'
import tar from 'next/dist/compiled/tar'
import fetch from 'next/dist/compiled/node-fetch'
import { fileExists } from './file-exists'

const MAX_VERSIONS_TO_CACHE = 5

export async function downloadWasmSwc(
  version: string,
  wasmDirectory: string,
  variant: 'nodejs' | 'web' = 'nodejs'
) {
  const pkgName = `@next/swc-wasm-${variant}`
  const tarFileName = `${pkgName.substring(6)}-${version}.tgz`
  const outputDirectory = path.join(wasmDirectory, pkgName)

  if (await fileExists(outputDirectory)) {
    // if the package is already downloaded a different
    // failure occurred than not being present
    return
  }

  // get platform specific cache directory adapted from playwright's handling
  // https://github.com/microsoft/playwright/blob/7d924470d397975a74a19184c136b3573a974e13/packages/playwright-core/src/utils/registry.ts#L141
  const cacheDirectory = (() => {
    let result
    const envDefined = process.env['NEXT_SWC_PATH']

    if (envDefined) {
      result = envDefined
    } else {
      let systemCacheDirectory
      if (process.platform === 'linux') {
        systemCacheDirectory =
          process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache')
      } else if (process.platform === 'darwin') {
        systemCacheDirectory = path.join(os.homedir(), 'Library', 'Caches')
      } else if (process.platform === 'win32') {
        systemCacheDirectory =
          process.env.LOCALAPPDATA ||
          path.join(os.homedir(), 'AppData', 'Local')
      } else {
        console.error(new Error('Unsupported platform: ' + process.platform))
        process.exit(0)
      }
      result = path.join(systemCacheDirectory, 'next-swc')
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
  })()

  await fs.promises.mkdir(outputDirectory, { recursive: true })

  const extractFromTar = async () => {
    await tar.x({
      file: path.join(cacheDirectory, tarFileName),
      cwd: outputDirectory,
      strip: 1,
    })
  }

  if (!(await fileExists(path.join(cacheDirectory, tarFileName)))) {
    Log.info('Downloading WASM swc package...')
    await fs.promises.mkdir(cacheDirectory, { recursive: true })
    const tempFile = path.join(
      cacheDirectory,
      `${tarFileName}.temp-${Date.now()}`
    )
    let registry = `https://registry.npmjs.org/`

    try {
      const output = execSync('npm config get registry').toString().trim()
      if (output.startsWith('http')) {
        registry = output
      }
    } catch (_) {}

    await fetch(`${registry}${pkgName}/-/${tarFileName}`).then((res) => {
      if (!res.ok) {
        throw new Error(`request failed with status ${res.status}`)
      }
      const cacheWriteStream = fs.createWriteStream(tempFile)

      return new Promise<void>((resolve, reject) => {
        res.body
          .pipe(cacheWriteStream)
          .on('error', (err) => reject(err))
          .on('finish', () => resolve())
      }).finally(() => cacheWriteStream.close())
    })
    await fs.promises.rename(tempFile, path.join(cacheDirectory, tarFileName))
  }
  await extractFromTar()

  const cacheFiles = await fs.promises.readdir(cacheDirectory)

  if (cacheFiles.length > MAX_VERSIONS_TO_CACHE) {
    cacheFiles.sort()

    for (let i = MAX_VERSIONS_TO_CACHE - 1; i++; i < cacheFiles.length) {
      await fs.promises
        .unlink(path.join(cacheDirectory, cacheFiles[i]))
        .catch(() => {})
    }
  }
}
