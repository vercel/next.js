import { promises as fs } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'

/** Copy the published frontend into relocatable application output. No compiler runs here. */
export async function copyGoFrontend(distDir: string) {
  const goos = process.platform
  const goarch = process.arch === 'x64' ? 'amd64' : process.arch
  if (
    !['linux', 'darwin'].includes(goos) ||
    !['amd64', 'arm64'].includes(goarch)
  ) {
    throw new Error('experimental.goServer supports Linux/macOS on x64/arm64')
  }
  const source = join(__dirname, '../go', `next-server-${goos}-${goarch}`)
  const destination = join(distDir, 'server', 'go-front')
  const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`
  try {
    await fs.copyFile(source, temporary, fs.constants.COPYFILE_EXCL)
    await fs.chmod(temporary, 0o755)
    await fs.rename(temporary, destination)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}
