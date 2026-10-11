import { nextTestSetup } from 'e2e-utils'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'

describe('next-testing-package', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  it('ships the public authoring entry points in the isolated package', async () => {
    const requireFromConsumer = createRequire(
      join(next.testDir, 'package.json')
    )
    for (const entry of ['vitest', 'rsc', 'browser']) {
      const entryPath = requireFromConsumer.resolve(
        `next/experimental/testing/${entry}`
      )
      expect(entryPath).toContain('experimental/testing/')
      const declaration = await readFile(
        entryPath.replace(/\.js$/, '.d.ts'),
        'utf8'
      )
      expect(declaration).toContain('dist/experimental/testing/')
    }
  })
})
