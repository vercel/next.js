import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'

describe('app-dir-hide-suppressed-error-during-next-export', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      files: {
        'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
        app: new FileRef(join(__dirname, 'app')),
      },
    })
  })
  afterAll(() => next.destroy())

  it('should not log suppressed error when exporting static page', async () => {
    await expect(next.start()).rejects.toThrow('next build failed')
    expect(next.cliOutput).toInclude('Page build time error')
    expect(next.cliOutput).toInclude('occurred prerendering page "/"')
    expect(next.cliOutput).toInclude(
      'Export encountered errors on following paths'
    )
    expect(next.cliOutput).not.toInclude(
      'The specific message is omitted in production builds to avoid leaking sensitive details.'
    )
  })
})
