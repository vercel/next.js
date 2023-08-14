import os from 'os'
import fs from 'fs-extra'
import path from 'path'
import { getCacheDirectory } from './helpers/get-cache-directory'
const { fetch } = require('next/dist/compiled/undici') as {
  fetch: typeof global.fetch
}

const MKCERT_VERSION = 'v1.4.4'

function getMkcertBinaryName() {
  const platform = os.platform()
  const arch = os.arch()

  if (platform === 'win32') {
    return `mkcert-${MKCERT_VERSION}-windows-${arch}.exe`
  }
  if (platform === 'darwin') {
    return `mkcert-${MKCERT_VERSION}-darwin-${arch}`
  }
  if (platform === 'linux') {
    return `mkcert-${MKCERT_VERSION}-linux-${arch}`
  }

  throw new Error(`Unsupported platform: ${platform}`)
}

export const downloadMkcertBinary = async () => {
  try {
    const binaryName = getMkcertBinaryName()
    const cacheDirectory = await getCacheDirectory()
    const binaryPath = path.join(cacheDirectory, binaryName)

    if (await fs.pathExists(binaryPath)) {
      return binaryPath
    }

    const downloadUrl = `https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/${binaryName}`

    const res = await fetch(downloadUrl)

    if (!res.ok) {
      throw new Error(`Failed to download mkcert binary from ${downloadUrl}`)
    }

    if (!res.body) {
      throw new Error('request failed with empty body')
    }

    const fileStream = fs.createWriteStream(binaryPath)
    await res.body.pipeTo(
      new WritableStream({
        write(chunk) {
          fileStream.write(chunk)
        },
        close() {
          fileStream.close()
        },
      })
    )

    await fs.chmod(binaryPath, 0o755)

    return binaryPath
  } catch (err) {
    console.error('Error downloading mkcert:', err)
  }
}
