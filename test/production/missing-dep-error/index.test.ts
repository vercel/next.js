import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('missing-dep-error', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.tsx': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
      },
      skipStart: true,
    })
  })
  afterAll(() => next.destroy())

  it('should only show error once', async () => {
    await next.start().catch(() => {})
    expect(
      next.cliOutput.match(/It looks like you're trying to use TypeScript/g)
        ?.length
    ).toBe(1)
  })
})
