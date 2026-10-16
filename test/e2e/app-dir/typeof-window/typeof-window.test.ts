import { FileRef, nextTestSetup } from 'e2e-utils'
import { execFileSync } from 'child_process'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

describe('typeof-window', () => {
  const overrideFiles: Record<string, FileRef> = {}
  let archiveDir: string

  beforeAll(async () => {
    archiveDir = await mkdtemp(join(tmpdir(), 'my-differentiated-files-'))
    const archivePath = join(archiveDir, 'my-differentiated-files.tgz')
    execFileSync('tar', ['-czf', archivePath, 'my-differentiated-files'], {
      cwd: __dirname,
    })
    overrideFiles['my-differentiated-files.tgz'] = new FileRef(archivePath)
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
      'my-differentiated-files': 'file:./my-differentiated-files.tgz',
    },
  })

  it('should work using cheerio', async () => {
    const $ = await next.render$('/')
    expect($('h1').text()).toBe('Page loaded')
  })
})
