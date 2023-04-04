import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import { join } from 'path'

describe('app dir - metadata missing metadataBase', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    return it('should skip for deploy', () => {})
  }

  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      files: new FileRef(__dirname),
    })
  })
  afterAll(() => next.destroy())

  if (globalThis.isNextDev) {
    it('should warning in development', async () => {
      await next.start()
      await fetchViaHTTP(next.url, '/blog')
      expect(next.cliOutput).toInclude(
        'metadata.metadataBase is not set for resolving url "/blog/opengraph-image?'
      )
      expect(next.cliOutput).toInclude(', fallbacks to "http://localhost:')
      expect(next.cliOutput).toInclude(
        '. See https://beta.nextjs.org/docs/api-reference/metadata#metadatabase'
      )
    })
  } else {
    it('should error in production', async () => {
      await expect(next.start()).rejects.toThrow('next build failed')
      expect(next.cliOutput).toInclude(
        'metadata.metadataBase needs to be set for resolving url "/blog/opengraph-image?'
      )
      expect(next.cliOutput).toInclude(
        '. See https://beta.nextjs.org/docs/api-reference/metadata#metadatabase'
      )
    })
  }
})

describe('app dir - metadata fallback metadataBase', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    return it('should skip for deploy', () => {})
  }

  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      files: {
        app: new FileRef(join(__dirname, 'app')),
        'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
        'vercel.json': '{}',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should warning both in development and prod', async () => {
    await next.start()
    await fetchViaHTTP(next.url, '/blog')
    expect(next.cliOutput).toInclude(
      'metadata.metadataBase is not set for resolving url "/blog/opengraph-image?'
    )
    expect(next.cliOutput).toInclude(', fallbacks to "http://localhost:')
    expect(next.cliOutput).toInclude(
      '. See https://beta.nextjs.org/docs/api-reference/metadata#metadatabase'
    )
  })
})
