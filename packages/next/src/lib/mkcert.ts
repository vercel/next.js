import fs from 'fs'
import path from 'path'
import { getCacheDirectory } from './helpers/get-cache-directory'
import * as Log from '../build/output/log'
import { execSync } from 'child_process'

const MKCERT_VERSION = 'v1.4.4'

export interface SelfSignedCertificate {
  key: string
  cert: string
  rootCA?: string
}

function getBinaryName() {
  const platform = process.platform
  const arch = process.arch === 'x64' ? 'amd64' : process.arch

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
    const cacheDirectory = getCacheDirectory('mkcert')
    const binaryPath = path.join(cacheDirectory, binaryName)

    if (fs.existsSync(binaryPath)) {
      return binaryPath
    }

    const downloadUrl = `https://github.com/FiloSottile/mkcert/releases/download/${MKCERT_VERSION}/${binaryName}`

    await fs.promises.mkdir(cacheDirectory, { recursive: true })

    Log.info(`Downloading mkcert package...`)

    const response = await fetch(downloadUrl)

    if (!response.ok || !response.body) {
      throw new Error(`request failed with status ${response.status}`)
    }

    Log.info(`Download response was successful, writing to disk`)

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    await fs.promises.writeFile(binaryPath, buffer)
    await fs.promises.chmod(binaryPath, 0o755)

    return binaryPath
  } catch (err) {
    Log.error('Error downloading mkcert:', err)
  }
}

export async function createSelfSignedCertificate(
  host?: string,
  certDir: string = 'certificates'
): Promise<SelfSignedCertificate | undefined> {
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
      'Attempting to generate self signed certificate. This may prompt for your password'
    )

    const defaultHosts = ['localhost', '127.0.0.1', '::1']

    const hosts =
      host && !defaultHosts.includes(host)
        ? [...defaultHosts, host]
        : defaultHosts

    execSync(
      `"${binaryPath}" -install -key-file "${keyPath}" -cert-file "${certPath}" ${hosts.join(
        ' '
      )}`,
      { stdio: 'ignore' }
    )

    const caLocation = execSync(`"${binaryPath}" -CAROOT`).toString().trim()

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      throw new Error('Certificate files not found')
    }

    Log.info(`CA Root certificate created in ${caLocation}`)
    Log.info(`Certificates created in ${resolvedCertDir}`)

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
      rootCA: `${caLocation}/rootCA.pem`,
    }
  } catch (err) {
    Log.error(
      'Failed to generate self-signed certificate. Falling back to http.',
      err
    )
  }
}
