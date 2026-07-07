import { nextTestSetup } from 'e2e-utils'
import { listClientChunks } from 'next-test-utils'
import { join } from 'path'

describe('NEXT_HASH_SALT', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  /** Build with the given salt and return { chunks, images, css } filename lists. */
  async function buildWithSalt(salt: string) {
    await next.clean()
    await next.build({ env: { NEXT_HASH_SALT: salt } })
    const files = await listClientChunks(join(next.testDir, next.distDir))
    const chunks = files.filter(
      (f) => f.includes('/chunks/') && f.endsWith('.js')
    )
    const images = files.filter((f) => f.endsWith('.png'))
    const css = files.filter((f) => f.endsWith('.css'))
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

  async function buildWithSalts(opts: {
    configSalt?: string
    envSalt?: string
    adapterSalt?: string
  }) {
    const env: Record<string, string> = {}
    if (opts.configSalt) env.OUTPUT_HASH_SALT_CONFIG = opts.configSalt
    if (opts.envSalt) env.NEXT_HASH_SALT = opts.envSalt
    if (opts.adapterSalt) env.ADAPTER_HASH_SALT = opts.adapterSalt
    await next.clean()
    await next.build({ env })
    const chunks = (
      await listClientChunks(join(next.testDir, next.distDir))
    ).filter((f) => f.includes('/chunks/') && f.endsWith('.js'))
    return chunks.sort()
  }

  let noSaltChunks: string[]
  let configOnlyChunks: string[]
  let envOnlyChunks: string[]
  let adapterEnvOnlyChunks: string[]
  let configAndEnvChunks: string[]
  let configAndAdapterEnvChunks: string[]
  let envAndAdapterEnvChunks: string[]

  beforeAll(
    async () => {
      noSaltChunks = await buildWithSalts({})
      configOnlyChunks = await buildWithSalts({ configSalt: 'config-salt' })
      envOnlyChunks = await buildWithSalts({ envSalt: 'env-salt' })
      adapterEnvOnlyChunks = await buildWithSalts({
        adapterSalt: 'adapter-salt',
      })
      configAndEnvChunks = await buildWithSalts({
        configSalt: 'config-salt',
        envSalt: 'env-salt',
      })
      configAndAdapterEnvChunks = await buildWithSalts({
        configSalt: 'config-salt',
        adapterSalt: 'adapter-salt',
      })
      envAndAdapterEnvChunks = await buildWithSalts({
        envSalt: 'env-salt',
        adapterSalt: 'adapter-salt',
      })
    },
    5 * 60 * 1000
  )

  it('config salt changes filenames compared to no salt', () => {
    expect(configOnlyChunks).not.toEqual(noSaltChunks)
  })

  it('config-and-env salt differs', () => {
    expect(configAndEnvChunks).not.toEqual(envOnlyChunks)
    expect(configAndEnvChunks).not.toEqual(configOnlyChunks)
  })

  it('config-and-adapter-env salt differs', () => {
    expect(configAndAdapterEnvChunks).not.toEqual(configOnlyChunks)
    expect(configAndAdapterEnvChunks).not.toEqual(adapterEnvOnlyChunks)
  })

  it('env-and-adapter-env salt differs', () => {
    expect(envAndAdapterEnvChunks).not.toEqual(envOnlyChunks)
    expect(envAndAdapterEnvChunks).not.toEqual(adapterEnvOnlyChunks)
  })
})
