import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

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

  it('should fallback to localhost if metadataBase is missing for absolute urls resolving', async () => {
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
