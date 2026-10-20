import { promises as fs } from 'fs'
import { join } from 'path'
import { createHash, randomBytes } from 'crypto'

function frontendFiles() {
  const goos = process.platform
  const goarch = process.arch === 'x64' ? 'amd64' : process.arch
  if (
    !['linux', 'darwin'].includes(goos) ||
    !['amd64', 'arm64'].includes(goarch)
  ) {
    throw new Error(
      'experimental.goServer supports Linux and macOS on x64/arm64 only'
    )
  }
  if (goos === 'linux') {
    const report = process.report.getReport() as {
      header: { glibcVersionRuntime?: string }
    }
    if (!report.header.glibcVersionRuntime) {
      throw new Error(
        'experimental.goServer requires glibc on Linux; musl is unsupported'
      )
    }
  }
  const source = join(__dirname, '../go', `next-server-${goos}-${goarch}`)
  return { source, goos, goarch }
}

/** Validate the published host before compiling any application plugin. */
export async function readGoFrontendBuildInfo(): Promise<string> {
  const { source, goos, goarch } = frontendFiles()
  const metadata = `${source}.build.json`
  const stat = await fs.lstat(metadata)
  if (!stat.isFile() || stat.size > 65536)
    throw new Error('Invalid Go frontend build configuration')
  const text = await fs.readFile(metadata, 'utf8')
  const info = JSON.parse(text)
  const binaryStat = await fs.lstat(source)
  // Package extraction may normalize modes. Application publication sets the
  // executable bit after validating the regular file and its content hash.
  if (!binaryStat.isFile()) throw new Error('Invalid published Go frontend')
  const hash = createHash('sha256')
    .update(await fs.readFile(source))
    .digest('hex')
  if (
    info.protocol !== 'next-go-plugin/1' ||
    info.goos !== goos ||
    info.goarch !== goarch ||
    typeof info.goVersion !== 'string' ||
    info.sha256 !== hash ||
    info.settings?.CGO_ENABLED !== '1'
  ) {
    throw new Error(
      'Incompatible or incomplete published Go frontend; rebuild the Next.js package'
    )
  }
  return text
}

/** Copy the published frontend and its build identity. No compiler runs here. */
export async function copyGoFrontend(distDir: string) {
  const { source } = frontendFiles()
  const info = await readGoFrontendBuildInfo()
  const destination = join(distDir, 'server', 'go-front')
  const metadata = `${destination}.build.json`
  const suffix = randomBytes(8).toString('hex')
  const temporary = `${destination}.${suffix}.tmp`
  const temporaryMetadata = `${metadata}.${suffix}.tmp`
  try {
    await fs.copyFile(source, temporary, fs.constants.COPYFILE_EXCL)
    await fs.chmod(temporary, 0o755)
    await fs.writeFile(temporaryMetadata, info, { flag: 'wx', mode: 0o644 })
    await fs.rename(temporary, destination)
    await fs.rename(temporaryMetadata, metadata)
  } finally {
    await fs.rm(temporary, { force: true })
    await fs.rm(temporaryMetadata, { force: true })
  }
}
