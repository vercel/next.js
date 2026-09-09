import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

jest.setTimeout(120_000)

describe('Cache Components config parity', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  it('rejects a production server when its build config is omitted', async () => {
    await next.build()
    await next.deleteFile('next.config.js')

    await next.start({ skipBuild: true })
    await retry(async () => {
      expect(next.cliOutput).toContain(
        'The production build was created with `cacheComponents: true`, but the runtime configuration has `cacheComponents: false`.'
      )
      await expect(next.fetch('/')).rejects.toThrow()
    })
  })
})
