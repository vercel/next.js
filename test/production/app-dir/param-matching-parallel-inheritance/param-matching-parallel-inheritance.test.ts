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

  it('allows all parallel branches to explicitly replace the inherited policy', async () => {
    for (const file of [
      'app/[lang]/page.tsx',
      'app/[lang]/@sidebar/page.tsx',
    ]) {
      await next.patchFile(
        file,
        `export const experimental_paramMatching = { lang: 'blocking' } as const\n${await next.readFile(file)}`
      )
    }

    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain(
      'conflicting parallel parameter matching modes'
    )
    expect(exitCode).toBe(0)
  })
})
