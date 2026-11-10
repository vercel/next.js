import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const projectRoot = process.cwd()
const source = path.join(projectRoot, 'fixtures/additional-root')
const temporaryDirectory = await fs.realpath(os.tmpdir())
const destination = await fs.mkdtemp(
  path.join(temporaryDirectory, 'next-additional-root-')
)
const linkedPackage = path.join(destination, 'packages/linked')
const link = path.join(projectRoot, 'linked')

try {
  await fs.cp(source, destination, { recursive: true })

  await fs.rm(link, { recursive: true, force: true })
  await fs.symlink(
    process.platform === 'win32'
      ? linkedPackage
      : path.relative(projectRoot, linkedPackage),
    link,
    'junction'
  )
} catch (error) {
  await fs.rm(destination, { recursive: true, force: true })
  throw error
}

process.stdout.write(`${destination}\n`)
