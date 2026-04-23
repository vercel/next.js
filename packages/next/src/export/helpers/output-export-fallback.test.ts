import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeOutputExportFallbackHtml } from './output-export-fallback'

describe('output export fallback artifacts', () => {
  const tmpDirs = new Set<string>()

  afterEach(async () => {
    await Promise.all(
      [...tmpDirs].map((dir) => rm(dir, { recursive: true, force: true }))
    )
    tmpDirs.clear()
  })

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'next-export-fallback-'))
    tmpDirs.add(dir)
    return dir
  }

  it('does not overwrite a user-provided global fallback file', async () => {
    const outDir = await createTempDir()
    await mkdir(outDir, { recursive: true })
    await writeFile(
      join(outDir, 'index.html'),
      '<html><head></head><body>index</body></html>'
    )
    await writeFile(join(outDir, '_fallback.html'), 'user fallback')

    await expect(
      writeOutputExportFallbackHtml(outDir, [])
    ).rejects.toMatchObject({
      code: 'NEXT_EXPORT_ERROR',
    })

    await expect(
      readFile(join(outDir, '_fallback.html'), 'utf8')
    ).resolves.toBe('user fallback')
  })
})
