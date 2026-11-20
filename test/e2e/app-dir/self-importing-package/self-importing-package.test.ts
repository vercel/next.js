import { FileRef, nextTestSetup } from 'e2e-utils'
import { execFileSync } from 'child_process'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

describe('self-importing-package', () => {
  const overrideFiles: Record<string, FileRef> = {}
  let archiveDir: string

  beforeAll(async () => {
    archiveDir = await mkdtemp(join(tmpdir(), 'internal-pkg-'))
    const archivePath = join(archiveDir, 'internal-pkg.tgz')
    execFileSync('tar', ['-czf', archivePath, 'internal-pkg'], {
      cwd: __dirname,
    })
    overrideFiles['internal-pkg.tgz'] = new FileRef(archivePath)
  })

  afterAll(async () => {
    if (archiveDir) {
      await rm(archiveDir, { recursive: true, force: true })
    }
  })

  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles,
    dependencies: {
      'internal-pkg': 'file:./internal-pkg.tgz',
    },
  })

  it('should resolve self-imports in an external package', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('test abc')
  })
})
