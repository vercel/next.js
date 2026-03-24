import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { readdir } from 'fs/promises'

async function getChunkFilenames(dir: string): Promise<string[]> {
  const entries: string[] = []
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() && entry.name.endsWith('.js')) {
        entries.push(entry.name)
      }
    }
  } catch {
    // directory may not exist
  }
  return entries
}

describe('NEXT_HASH_SALT', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const chunksDir = () => join(next.testDir, '.next/static/chunks')

  // Three builds: salt-a (first), salt-a (second, same salt), salt-b (different salt)
  let saltAFirst: string[] = []
  let saltASecond: string[] = []
  let saltB: string[] = []

  beforeAll(async () => {
    await next.build({ env: { NEXT_HASH_SALT: 'salt-a' } })
    saltAFirst = await getChunkFilenames(chunksDir())

    await next.clean()
    await next.build({ env: { NEXT_HASH_SALT: 'salt-a' } })
    saltASecond = await getChunkFilenames(chunksDir())

    await next.clean()
    await next.build({ env: { NEXT_HASH_SALT: 'salt-b' } })
    saltB = await getChunkFilenames(chunksDir())
  })

  it('should produce chunk files', () => {
    expect(saltAFirst.length).toBeGreaterThan(0)
  })

  it('same salt produces identical chunk filenames', () => {
    expect(saltAFirst.sort()).toEqual(saltASecond.sort())
  })

  it('different salt produces different chunk filenames', () => {
    expect(saltAFirst.sort()).not.toEqual(saltB.sort())
  })
})
