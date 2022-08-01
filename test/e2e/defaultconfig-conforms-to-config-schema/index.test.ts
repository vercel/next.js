import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('defaultConfig conforms to config schema', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() {
            return
          }
        `,
        'next.config.js': `
        module.exports = (_, c) => c.defaultConfig`,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    await renderViaHTTP(next.url, '/')
    expect(next.cliOutput).not.toMatch(
      'Invalid next.config.js options detected:'
    )
  })
})
