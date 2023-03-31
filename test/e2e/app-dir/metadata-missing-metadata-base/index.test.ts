import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('app dir - metadata missing metadataBase', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      dependencies: {
        '@vercel/og': 'latest',
      },
      files: new FileRef(__dirname),
    })
  })
  afterAll(() => next.destroy())

  if (globalThis.isNextDev) {
    it('should warning in development', async () => {
      await next.start()
      await fetchViaHTTP(next.url, '/')
      expect(next.cliOutput).toInclude(
        'metadata.metadataBase is not set and fallbacks to "http://localhost:'
      )
      expect(next.cliOutput).toInclude(
        'please specify it in root layout to resolve absolute urls.'
      )
    })
  } else {
    it('should error in production', async () => {
      await expect(next.start()).rejects.toThrow('next build failed')
      expect(next.cliOutput).toInclude(
        'metadata.metadataBase needs to be provided for resolving absolute URL: /opengraph-image?'
      )
    })
  }
})
