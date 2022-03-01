import { getPageRuntime } from 'next/dist/build/entries'
import { join } from 'path'

const fixtureDir = join(__dirname, 'fixtures')

describe('parse page runtime config', () => {
  it('should parse nodejs runtime correctly', async () => {
    const runtime = await getPageRuntime(
      join(fixtureDir, 'page-runtime/nodejs.js')
    )
    expect(runtime).toBe('nodejs')
  })

  it('should parse edge runtime correctly', async () => {
    const runtime = await getPageRuntime(
      join(fixtureDir, 'page-runtime/edge.js')
    )
    expect(runtime).toBe('edge')
  })
})
