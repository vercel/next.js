import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, retry } from 'next-test-utils'

describe('fatal-error', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          }
        `,
      },
      dependencies: {},
      skipStart: true,
    })
  })
  afterAll(() => next.destroy())

  it('should restart the dev server', async () => {
    // Make the dev server crash with a fatal error
    process.env.__NEXT_DEV_NODE_ARGS = '--max-old-space-size=50'
    await next.start()

    await check(
      () => next.cliOutput,
      /Restarting the server due to a fatal error/
    )

    await retry(() => {
      const numberOfServerStarts = next.cliOutput
        .split('\n')
        .filter((row) => /started server on .+:.+, url: .+/.test(row)).length

      expect(numberOfServerStarts).toBeGreaterThan(1)
    })
  })
})
