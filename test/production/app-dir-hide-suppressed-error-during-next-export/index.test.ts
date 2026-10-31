import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('app-dir-hide-suppressed-error-during-next-export', () => {
  const { next } = nextTestSetup({
    skipStart: true,
    files: {
      'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
      app: new FileRef(join(__dirname, 'app')),
    },
  })

  it('should not log suppressed error when exporting static page', async () => {
    await expect(next.start()).rejects.toThrow('next build failed')
    expect(next.cliOutput).toInclude('Page build time error')
    expect(next.cliOutput).toInclude('occurred prerendering page "/"')
    expect(next.cliOutput).toInclude('Export encountered errors on 1 path')
    expect(next.cliOutput).not.toInclude(
      'The specific message is omitted in production builds to avoid leaking sensitive details.'
    )
  })
})
