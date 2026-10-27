import { FileRef, nextTestSetup } from 'e2e-utils'
import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { createFeatureFiles } from './create-features'

describe('turbopack-fragments-best-case', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      'next.config.ts': new FileRef(join(__dirname, 'next.config.ts')),
      ...createFeatureFiles(),
    },
  })

  it.each(Array.from({ length: 16 }, (_, i) => i))(
    'renders independent feature %i',
    async (i) => {
      const $ = await next.render$(`/feature-${i}`)
      expect($('p').text()).toMatch(new RegExp(`^feature-${i}:`))
    }
  )

  it('renders the all-features control', async () => {
    const $ = await next.render$('/all')
    expect($('p').text().split('|')).toHaveLength(16)
  })

  it('narrows a static namespace member', async () => {
    const $ = await next.render$('/namespace')
    expect($('p').text()).toMatch(/^feature-0:/)
  })

  // Chunk artifacts are unavailable on deployments; rendering is tested in every mode above.
  // @force-gate start && turbopack
  it('emits one small chunk per independent feature', async () => {
    const directory = join(next.testDir, '.next/server/chunks/ssr')
    const files = (await readdir(directory)).filter(
      (file) => file.includes('lib_features_ts') && file.endsWith('.js')
    )
    expect(files).toHaveLength(16)
    for (const file of files) {
      const chunk = join(directory, file)
      expect((await stat(chunk)).size).toBeLessThan(20_000)
      const map = JSON.parse(await readFile(`${chunk}.map`, 'utf8'))
      expect(
        map.sources.filter((source: string) =>
          /\/lib\/data-\d+\.ts$/.test(source)
        )
      ).toHaveLength(1)
    }
  })
})
