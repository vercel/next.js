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

  // Three builds: salt-a (first), salt-a (second, same salt), salt-b (different salt)
  let saltAFirst: string[] = []
  let saltAImages: string[] = []
  let saltASecond: string[] = []
  let saltB: string[] = []
  let saltBImages: string[] = []

  beforeAll(async () => {
    await next.build({ env: { NEXT_HASH_SALT: 'salt-a' } })
    saltAFirst = await getFilenames(chunksDir(), '.js')
    saltAImages = await getFilenames(mediaDir(), '.png')

    await next.clean()
    await next.build({ env: { NEXT_HASH_SALT: 'salt-a' } })
    saltASecond = await getFilenames(chunksDir(), '.js')

    await next.clean()
    await next.build({ env: { NEXT_HASH_SALT: 'salt-b' } })
    saltB = await getFilenames(chunksDir(), '.js')
    saltBImages = await getFilenames(mediaDir(), '.png')
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

  it('should produce image files', () => {
    expect(saltAImages.length).toBeGreaterThan(0)
  })

  it('different salt produces different image filenames', () => {
    expect(saltAImages.sort()).not.toEqual(saltBImages.sort())
  })
})
