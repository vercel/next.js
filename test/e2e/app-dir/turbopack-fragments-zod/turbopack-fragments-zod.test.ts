import { nextTestSetup } from 'e2e-utils'
import { readFile, stat } from 'fs/promises'
import { dirname, join } from 'path'

describe('turbopack-fragments-zod', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { zod: '4.3.6' },
  })

  it('parses a string schema', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('valid')
  })

  it('parses a number schema', async () => {
    const $ = await next.render$('/number')
    expect($('p').text()).toBe('42')
  })

  it('retains an escaping namespace', async () => {
    const $ = await next.render$('/all')
    expect($('p').text().split(',')).toEqual(
      expect.arrayContaining(['string', 'number', 'object'])
    )
  })

  // Deployment does not expose local traces; all routes are rendered above in every mode.
  // @force-gate start && turbopack
  it('keeps the narrow routes Zod chunks below the whole-library baseline', async () => {
    for (const entry of ['page.js', 'number/page.js']) {
      const page = join(next.testDir, '.next/server/app', entry)
      const trace = JSON.parse(await readFile(`${page}.nft.json`, 'utf8'))
      const chunks = trace.files.filter(
        (file: string) =>
          file.replace(/\\/g, '/').includes('/chunks/') && file.endsWith('.js')
      )
      let zodChunks = 0
      for (const file of chunks) {
        const chunk = join(dirname(page), file)
        const map = JSON.parse(await readFile(`${chunk}.map`, 'utf8'))
        if (map.sources?.some((source: string) => source.includes('/zod/'))) {
          zodChunks++
          expect((await stat(chunk)).size).toBeLessThan(150_000)
        }
      }
      expect(zodChunks).toBeGreaterThan(0)
    }
  })
})
