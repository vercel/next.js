import os from 'os'
import fs from 'fs-extra'
import path from 'path'
import { getCacheDirectory } from './helpers/get-cache-directory'
import * as Log from '../build/output/log'
import execa from 'execa'

const { fetch } = require('next/dist/compiled/undici') as {
  fetch: typeof global.fetch
}

const MKCERT_VERSION = 'v1.4.4'

function getBinaryName() {
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

async function downloadBinary() {
  try {
    const binaryName = getBinaryName()
    const cacheDirectory = await getCacheDirectory('mkcert')
    const binaryPath = path.join(cacheDirectory, binaryName)

    if (await fs.pathExists(binaryPath)) {
      return binaryPath
    }

    const downloadUrl = `https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/${binaryName}`
    const tempFile = path.join(
      cacheDirectory,
      `${binaryName}.temp-${Date.now()}`
    )

    await fs.promises.mkdir(cacheDirectory, { recursive: true })

    Log.info(`Downloading mkcert package...`)

    await fetch(downloadUrl).then((res) => {
      const { ok, body } = res
      if (!ok || !body) {
        Log.error(`Failed to download mkcert package from ${downloadUrl}`)
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

    await fs.promises.rename(tempFile, path.join(cacheDirectory, binaryName))
    await fs.chmod(binaryPath, 0o755)

    return binaryPath
  } catch (err) {
    Log.error('Error downloading mkcert:', err)
  }
}

export async function createSelfSignedCertificate(
  certDir: string = 'certificates'
) {
  try {
    const binaryPath = await downloadBinary()
    if (!binaryPath) throw new Error('missing mkcert binary')

    const resolvedCertDir = path.resolve(process.cwd(), `./${certDir}`)

    await fs.promises.mkdir(resolvedCertDir, {
      recursive: true,
    })

    const keyPath = path.resolve(resolvedCertDir, 'localhost-key.pem')
    const certPath = path.resolve(resolvedCertDir, 'localhost.pem')

    Log.info(
      'Attempting to generate self signed certificate. This may prompt for your password.'
    )

    await execa(binaryPath, [
      '-install',
      '-key-file',
      keyPath,
      '-cert-file',
      certPath,
      'localhost',
    ])

    const { stdout: caLocation } = await execa(binaryPath, ['-CAROOT'])

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      throw new Error('Failed to generate self-signed certificate')
    }

    Log.info(`CA Root certificate located at ${caLocation}.`)
    Log.info(`Certificates created at ${resolvedCertDir}.`)

    const gitignorePath = path.resolve(process.cwd(), './.gitignore')

    if (fs.existsSync(gitignorePath)) {
      const gitignore = await fs.promises.readFile(gitignorePath, 'utf8')
      if (!gitignore.includes(certDir)) {
        Log.info('Adding certificates to .gitignore')

        await fs.promises.appendFile(gitignorePath, `\n${certDir}`)
      }
    }

    return {
      key: keyPath,
      cert: certPath,
    }
  } catch (err) {
    Log.error(
      'Failed to generate self-signed certificate. Falling back to http.',
      err
    )
  }
}
