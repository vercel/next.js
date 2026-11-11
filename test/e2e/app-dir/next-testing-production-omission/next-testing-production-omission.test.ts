import { nextTestSetup } from 'e2e-utils'
import { resolve, join, relative } from 'node:path'
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'

describe('next-testing-production-omission', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (isNextDev || isNextDeploy) {
    it.skip('requires a local production build', () => {})
    return
  }

  beforeAll(async () => {
    await next.start()
  })

  it('serves the ordinary application with its explicit cache handler and asset', async () => {
    const html = await next.render('/')
    expect(html).toContain('hello world')
  })

  it('keeps explicit dependencies while omitting unused test source and configuration', async () => {
    expect(await next.readFile('tests/ignored.test.mjs')).toContain(
      'NEXT_OMISSION_TEST_ONLY_SENTINEL'
    )
    expect(await next.readFile('next.test.config.json')).toContain(
      'tests/*.test.mjs'
    )
    const files: string[] = []
    const traces: Record<string, string[]> = {}
    async function visit(directory: string) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name === 'cache') continue
        const file = join(directory, entry.name)
        if (entry.isDirectory()) await visit(file)
        else if (entry.name.endsWith('.nft.json')) {
          const trace = JSON.parse(await readFile(file, 'utf8'))
          traces[relative(next.testDir, file)] = trace.files
          files.push(
            ...trace.files.map((target: string) => resolve(directory, target))
          )
        }
      }
    }
    await visit(join(next.testDir, '.next'))
    const serverFiles = JSON.parse(
      await next.readFile('.next/required-server-files.json')
    )
    if (process.env.NEXT_TESTING_PRODUCTION_OMISSION_EVIDENCE) {
      await mkdir(process.env.NEXT_TESTING_PRODUCTION_OMISSION_EVIDENCE, {
        recursive: true,
      })
      await writeFile(
        join(
          process.env.NEXT_TESTING_PRODUCTION_OMISSION_EVIDENCE,
          'traces.json'
        ),
        JSON.stringify(
          {
            traces,
            files,
            configuredCacheHandler: serverFiles.config.cacheHandler,
          },
          null,
          2
        )
      )
    }
    expect(files).toContain(resolve(next.testDir, 'cache-handler.test.mjs'))
    expect(files).toContain(resolve(next.testDir, 'cache-handler-data.json'))
    expect(files).not.toContain(resolve(next.testDir, 'tests/ignored.test.mjs'))
    expect(files).not.toContain(
      resolve(next.testDir, 'tests/ignored-private-data.mjs')
    )
    expect(files).not.toContain(resolve(next.testDir, 'next.test.config.json'))
  })
})
