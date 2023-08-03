import os from 'os'
import fs from 'fs'
import path from 'path'
import * as Log from '../build/output/log'
import tar from 'next/dist/compiled/tar'
const { fetch } = require('next/dist/compiled/undici') as {
  fetch: typeof global.fetch
}
const { WritableStream } = require('node:stream/web') as {
  WritableStream: typeof global.WritableStream
}
import { fileExists } from './file-exists'
import { getRegistry } from './helpers/get-registry'

const MAX_VERSIONS_TO_CACHE = 8

// get platform specific cache directory adapted from playwright's handling
// https://github.com/microsoft/playwright/blob/7d924470d397975a74a19184c136b3573a974e13/packages/playwright-core/src/utils/registry.ts#L141
async function getCacheDirectory() {
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
        process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    } else {
      /// Attempt to use generic tmp location for un-handled platform
      if (!systemCacheDirectory) {
        for (const dir of [
          path.join(os.homedir(), '.cache'),
          path.join(os.tmpdir()),
        ]) {
          if (await fileExists(dir)) {
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
}

async function extractBinary(
  outputDirectory: string,
  pkgName: string,
  tarFileName: string
) {
  const cacheDirectory = await getCacheDirectory()

  const extractFromTar = async () => {
    await tar.x({
      file: path.join(cacheDirectory, tarFileName),
      cwd: outputDirectory,
      strip: 1,
    })
  }

  if (!(await fileExists(path.join(cacheDirectory, tarFileName)))) {
    Log.info(`Downloading swc package ${pkgName}...`)
    await fs.promises.mkdir(cacheDirectory, { recursive: true })
    const tempFile = path.join(
      cacheDirectory,
      `${tarFileName}.temp-${Date.now()}`
    )

    const registry = getRegistry()

    const downloadUrl = `${registry}${pkgName}/-/${tarFileName}`

    await fetch(downloadUrl).then((res) => {
      const { ok, body } = res
      if (!ok || !body) {
        Log.error(`Failed to download swc package from ${downloadUrl}`)
      }

      if (!ok) {
        throw new Error(`request failed with status ${res.status}`)
      }
      if (!body) {
        throw new Error('request failed with empty body')
      }
      const cacheWriteStream = fs.createWriteStream(tempFile)
      return body.pipeTo(
        new WritableStream({
          write(chunk) {
            cacheWriteStream.write(chunk)
          },
          close() {
            cacheWriteStream.close()
          },
        })
      )
    })
    await fs.promises.rename(tempFile, path.join(cacheDirectory, tarFileName))
  }
  await extractFromTar()

  const cacheFiles = await fs.promises.readdir(cacheDirectory)

  if (cacheFiles.length > MAX_VERSIONS_TO_CACHE) {
    cacheFiles.sort((a, b) => {
      if (a.length < b.length) return -1
      return a.localeCompare(b)
    })

    // prune oldest versions in cache
    for (let i = 0; i++; i < cacheFiles.length - MAX_VERSIONS_TO_CACHE) {
      await fs.promises
        .unlink(path.join(cacheDirectory, cacheFiles[i]))
        .catch(() => {})
    }
  }
}

export async function downloadNativeNextSwc(
  version: string,
  bindingsDirectory: string,
  triplesABI: Array<string>
) {
  for (const triple of triplesABI) {
    const pkgName = `@next/swc-${triple}`
    const tarFileName = `${pkgName.substring(6)}-${version}.tgz`
    const outputDirectory = path.join(bindingsDirectory, pkgName)

    if (await fileExists(outputDirectory)) {
      // if the package is already downloaded a different
      // failure occurred than not being present
      return
    }

    await fs.promises.mkdir(outputDirectory, { recursive: true })
    await extractBinary(outputDirectory, pkgName, tarFileName)
  }
}

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

  await fs.promises.mkdir(outputDirectory, { recursive: true })
  await extractBinary(outputDirectory, pkgName, tarFileName)
}
