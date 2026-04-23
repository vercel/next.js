import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import {
  emitOutputExportFallbackArtifacts,
  writeOutputExportFallbackHtml,
} from './output-export-fallback'

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

  async function createFallbackSource(outDir: string): Promise<string> {
    const orig = join(outDir, '..', 'server', 'app', 'docs', '[slug]')
    await mkdir(dirname(orig), { recursive: true })
    await writeFile(
      `${orig}.html`,
      '<html><head></head><body>docs</body></html>'
    )
    await writeFile(`${orig}.rsc`, 'rsc')
    await mkdir(`${orig}.segments`, { recursive: true })
    await writeFile(join(`${orig}.segments`, '_tree.segment.rsc'), 'tree')
    return orig
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

  it('does not overwrite a user-provided fallback manifest file', async () => {
    const outDir = await createTempDir()
    await mkdir(join(outDir, 'docs'), { recursive: true })
    await writeFile(join(outDir, 'docs', '__fallback.meta.json'), '{}')

    await expect(
      emitOutputExportFallbackArtifacts(
        [
          {
            fallbackRoute: '/docs/__fallback',
            needsManifest: true,
            variants: [
              {
                route: '/docs/[slug]/[page]',
                fallbackPath: '/docs/__fallback/__route_0',
                orig: await createFallbackSource(outDir),
              },
            ],
          },
        ],
        outDir,
        true
      )
    ).rejects.toMatchObject({
      code: 'NEXT_EXPORT_ERROR',
    })
  })

  it('does not overwrite user-provided fallback segment files', async () => {
    const outDir = await createTempDir()
    await mkdir(join(outDir, 'docs', '__fallback'), { recursive: true })
    await writeFile(
      join(outDir, 'docs', '__fallback', '__next._tree.txt'),
      'user'
    )

    await expect(
      emitOutputExportFallbackArtifacts(
        [
          {
            fallbackRoute: '/docs/__fallback',
            needsManifest: false,
            variants: [
              {
                route: '/docs/[slug]',
                fallbackPath: '/docs/__fallback',
                orig: await createFallbackSource(outDir),
              },
            ],
          },
        ],
        outDir,
        true
      )
    ).rejects.toMatchObject({
      code: 'NEXT_EXPORT_ERROR',
    })
  })
})
