import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, findPort } from 'next-test-utils'

describe('app dir - metadata missing metadataBase', () => {
  let next: NextInstance
  let port: number

  if ((global as any).isNextDeploy) {
    return it('should skip for deploy', () => {})
  }

  beforeAll(async () => {
    port = await findPort()
    next = await createNext({
      skipStart: true,
      files: new FileRef(__dirname),
      forcedPort: port + '',
    })
  })
  afterAll(() => next.destroy())

  it('should fallback to localhost if metadataBase is missing for absolute urls resolving', async () => {
    await next.start()
    await fetchViaHTTP(next.url, '/')
    expect(next.cliOutput).toInclude(
      'metadata.metadataBase is not set for resolving social open graph or twitter images, fallbacks to'
    )
    expect(next.cliOutput).toInclude(`"http://localhost:${port}`)
    expect(next.cliOutput).toInclude(
      '. See https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase'
    )
  })
})
