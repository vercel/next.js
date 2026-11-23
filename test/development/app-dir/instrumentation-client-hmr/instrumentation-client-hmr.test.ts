import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// @force-gate turbopack
describe('instrumentation-client-hmr', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('keeps instrumentation client chunk lists stable across routes', async () => {
    async function getChunkLists() {
      const chunkDir = join(next.testDir, '.next/dev/static/chunks')
      const files = await readdir(chunkDir)
      const lists = await Promise.all(
        files.map(async (file) => {
          const contents = await readFile(join(chunkDir, file), 'utf8')
          return contents.includes('TURBOPACK_CHUNK_LISTS')
            ? ([file, contents] as const)
            : undefined
        })
      )

      return Object.fromEntries(lists.filter((list) => list !== undefined))
    }

    const outputStart = next.cliOutput.length
    for (const route of ['/', '/other']) {
      const response = await next.fetch(route)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(`<h1>Route ${route}</h1>`)
    }

    const chunkListsAfterOther = await getChunkLists()
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<h1>Route /</h1>')
    expect(await getChunkLists()).toEqual(chunkListsAfterOther)

    expect(next.cliOutput.slice(outputStart)).not.toContain(
      '[Server HMR] Update failed'
    )

    const browser = await next.browser('/')
    await retry(async () => {
      expect(
        await browser.eval(
          () => document.documentElement.dataset.lazyModuleLoaded
        )
      ).toMatch(/^19\./)
    })
  })
})
