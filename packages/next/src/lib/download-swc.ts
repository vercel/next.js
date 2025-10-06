import fs from 'fs'
import path from 'path'
import * as Log from '../build/output/log'
import tar from 'next/dist/compiled/tar'
const { WritableStream } =
  require('node:stream/web') as typeof import('node:stream/web')
import { getRegistry } from './helpers/get-registry'
import { getCacheDirectory } from './helpers/get-cache-directory'

const MAX_VERSIONS_TO_CACHE = 8

async function extractBinary(
  outputDirectory: string,
  pkgName: string,
  tarFileName: string
) {
  const cacheDirectory = getCacheDirectory(
    'next-swc',
    process.env['NEXT_SWC_PATH']
  )

  const extractFromTar = () =>
    tar.x({
      file: path.join(cacheDirectory, tarFileName),
      cwd: outputDirectory,
      strip: 1,
    })

  if (!fs.existsSync(path.join(cacheDirectory, tarFileName))) {
    Log.info(`Downloading swc package ${pkgName}... to ${cacheDirectory}`)
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
            return new Promise<void>((resolve, reject) =>
              cacheWriteStream.write(chunk, (error) => {
                if (error) {
                  reject(error)
                  return
                }

                resolve()
              })
            )
          },
          close() {
            return new Promise<void>((resolve, reject) =>
              cacheWriteStream.close((error) => {
                if (error) {
                  reject(error)
                  return
                }

                resolve()
              })
            )
          },
        })
      )
    })

    await fs.promises.access(tempFile) // ensure the temp file existed
    await fs.promises.rename(tempFile, path.join(cacheDirectory, tarFileName))
  } else {
    Log.info(`Using cached swc package ${pkgName}...`)
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

    if (fs.existsSync(outputDirectory)) {
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

  if (fs.existsSync(outputDirectory)) {
    // if the package is already downloaded a different
    // failure occurred than not being present
    return
  }

  await fs.promises.mkdir(outputDirectory, { recursive: true })
  await extractBinary(outputDirectory, pkgName, tarFileName)
}
