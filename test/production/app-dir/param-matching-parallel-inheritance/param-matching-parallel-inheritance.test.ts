import { nextTestSetup } from 'e2e-utils'

describe('param-matching-parallel-inheritance', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('rejects an override that conflicts with a sibling inherited policy', async () => {
    const { exitCode, cliOutput } = await next.build()

    // All slots match /[lang]. Opening @main must not also open @sidebar,
    // which still inherits lang: 'not-found' from their shared layout.
    expect(cliOutput).toContain(
      'conflicting parallel parameter matching modes for parameter "lang"'
    )
    expect(exitCode).toBe(1)
  })
})
