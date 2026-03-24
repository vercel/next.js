import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { readdir } from 'fs/promises'

async function getFilenames(dir: string, ext: string): Promise<string[]> {
  const entries: string[] = []
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() && entry.name.endsWith(ext)) {
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
  const mediaDir = () => join(next.testDir, '.next/static/media')

  /** Build with the given salt and return { chunks, images } filename lists. */
  async function buildWithSalt(salt: string) {
    await next.build({ env: { NEXT_HASH_SALT: salt } })
    const chunks = await getFilenames(chunksDir(), '.js')
    const images = await getFilenames(mediaDir(), '.png')
    await next.clean()
    return { chunks, images }
  }

  // Three builds: salt-a (twice for reproducibility check) and salt-b.
  let saltAFirst: Awaited<ReturnType<typeof buildWithSalt>>
  let saltASecond: Awaited<ReturnType<typeof buildWithSalt>>
  let saltB: Awaited<ReturnType<typeof buildWithSalt>>

  beforeAll(async () => {
    saltAFirst = await buildWithSalt('salt-a')
    saltASecond = await buildWithSalt('salt-a')
    saltB = await buildWithSalt('salt-b')
  })

  it('should produce chunk files', () => {
    expect(saltAFirst.chunks.length).toBeGreaterThan(0)
  })

  it('same salt produces identical chunk filenames', () => {
    expect(saltAFirst.chunks.sort()).toEqual(saltASecond.chunks.sort())
  })

  it('different salt produces different chunk filenames', () => {
    expect(saltAFirst.chunks.sort()).not.toEqual(saltB.chunks.sort())
  })

  it('should produce image files', () => {
    expect(saltAFirst.images.length).toBeGreaterThan(0)
  })

  it('different salt produces different image filenames', () => {
    expect(saltAFirst.images.sort()).not.toEqual(saltB.images.sort())
  })
})
