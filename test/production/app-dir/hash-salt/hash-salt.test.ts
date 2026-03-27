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

describe('turbopack.outputHashSalt (config)', () => {
  const { next: nextNoSalt } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const { next: nextWithConfigSalt } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    nextConfig: {
      turbopack: { outputHashSalt: 'config-salt' },
    },
  })

  let noSaltChunks: string[]
  let configSaltChunks: string[]

  beforeAll(async () => {
    await nextNoSalt.build()
    noSaltChunks = await getFilenames(
      join(nextNoSalt.testDir, '.next/static/chunks'),
      '.js'
    )
    await nextNoSalt.clean()

    await nextWithConfigSalt.build()
    configSaltChunks = await getFilenames(
      join(nextWithConfigSalt.testDir, '.next/static/chunks'),
      '.js'
    )
    await nextWithConfigSalt.clean()
  })

  it('config salt produces different chunk filenames than no salt', () => {
    expect(configSaltChunks.sort()).not.toEqual(noSaltChunks.sort())
  })
})

describe('turbopack.outputHashSalt + NEXT_HASH_SALT combined', () => {
  const { next: nextEnvOnly } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const { next: nextConfigOnly } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    nextConfig: {
      turbopack: { outputHashSalt: 'config-salt' },
    },
  })

  const { next: nextBoth } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    nextConfig: {
      turbopack: { outputHashSalt: 'config-salt' },
    },
  })

  let envOnlyChunks: string[]
  let configOnlyChunks: string[]
  let bothChunks: string[]

  beforeAll(async () => {
    await nextEnvOnly.build({ env: { NEXT_HASH_SALT: 'env-salt' } })
    envOnlyChunks = await getFilenames(
      join(nextEnvOnly.testDir, '.next/static/chunks'),
      '.js'
    )
    await nextEnvOnly.clean()

    await nextConfigOnly.build()
    configOnlyChunks = await getFilenames(
      join(nextConfigOnly.testDir, '.next/static/chunks'),
      '.js'
    )
    await nextConfigOnly.clean()

    await nextBoth.build({ env: { NEXT_HASH_SALT: 'env-salt' } })
    bothChunks = await getFilenames(
      join(nextBoth.testDir, '.next/static/chunks'),
      '.js'
    )
    await nextBoth.clean()
  })

  it('combined salt differs from env-var-only salt', () => {
    expect(bothChunks.sort()).not.toEqual(envOnlyChunks.sort())
  })

  it('combined salt differs from config-only salt', () => {
    expect(bothChunks.sort()).not.toEqual(configOnlyChunks.sort())
  })
})
