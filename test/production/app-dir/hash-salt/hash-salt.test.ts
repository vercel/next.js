import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { readdir } from 'fs/promises'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'

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
  // Turbopack places CSS in .next/static/chunks/ rather than .next/static/css/,
  // so search the entire static tree for .css files.
  const staticDir = () => join(next.testDir, '.next/static')

  async function getCssFilenames(): Promise<string[]> {
    try {
      const paths = await recursiveReadDir(staticDir(), {
        pathnameFilter: (f) => f.endsWith('.css'),
      })
      return paths.map((p) => p.replace(/.*[\\/]/, ''))
    } catch {
      return []
    }
  }

  /** Build with the given salt and return { chunks, images, css } filename lists. */
  async function buildWithSalt(salt: string) {
    await next.build({ env: { NEXT_HASH_SALT: salt } })
    const chunks = await getFilenames(chunksDir(), '.js')
    const images = await getFilenames(mediaDir(), '.png')
    const css = await getCssFilenames()
    await next.clean()
    return { chunks, images, css }
  }

  // Three builds: salt-a (twice for reproducibility check) and salt-b.
  let saltAFirst: Awaited<ReturnType<typeof buildWithSalt>>
  let saltASecond: Awaited<ReturnType<typeof buildWithSalt>>
  let saltB: Awaited<ReturnType<typeof buildWithSalt>>

  beforeAll(
    async () => {
      saltAFirst = await buildWithSalt('salt-a')
      saltASecond = await buildWithSalt('salt-a')
      saltB = await buildWithSalt('salt-b')
    },
    5 * 60 * 1000
  )

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

  it('same salt produces identical image filenames', () => {
    expect(saltAFirst.images.sort()).toEqual(saltASecond.images.sort())
  })

  it('should produce css files', () => {
    expect(saltAFirst.css.length).toBeGreaterThan(0)
  })

  it('different salt produces different css filenames', () => {
    expect(saltAFirst.css.sort()).not.toEqual(saltB.css.sort())
  })

  it('same salt produces identical css filenames', () => {
    expect(saltAFirst.css.sort()).toEqual(saltASecond.css.sort())
  })
})

describe('experimental.outputHashSalt', () => {
  // Uses the fixture's next.config.js which reads OUTPUT_HASH_SALT_CONFIG from env,
  // allowing multiple builds with different config salts from a single next instance.
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const chunksDir = () => join(next.testDir, '.next/static/chunks')

  async function buildWithSalts(opts: {
    configSalt?: string
    envSalt?: string
  }) {
    const env: Record<string, string> = {}
    if (opts.configSalt) env.OUTPUT_HASH_SALT_CONFIG = opts.configSalt
    if (opts.envSalt) env.NEXT_HASH_SALT = opts.envSalt
    await next.build({ env })
    const chunks = await getFilenames(chunksDir(), '.js')
    await next.clean()
    return chunks
  }

  let noSaltChunks: string[]
  let configOnlyChunks: string[]
  let envOnlyChunks: string[]
  let bothChunks: string[]

  beforeAll(
    async () => {
      noSaltChunks = await buildWithSalts({})
      configOnlyChunks = await buildWithSalts({ configSalt: 'config-salt' })
      envOnlyChunks = await buildWithSalts({ envSalt: 'env-salt' })
      bothChunks = await buildWithSalts({
        configSalt: 'config-salt',
        envSalt: 'env-salt',
      })
    },
    5 * 60 * 1000
  )

  it('config salt changes filenames compared to no salt', () => {
    expect(configOnlyChunks.sort()).not.toEqual(noSaltChunks.sort())
  })

  it('combined salt differs from env-var-only salt', () => {
    expect(bothChunks.sort()).not.toEqual(envOnlyChunks.sort())
  })

  it('combined salt differs from config-only salt', () => {
    expect(bothChunks.sort()).not.toEqual(configOnlyChunks.sort())
  })
})
