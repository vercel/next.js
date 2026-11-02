import { gate } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('param-matching-parallel-inheritance', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('rejects an override that conflicts with a sibling inherited policy', async () => {
    const { exitCode, cliOutput } = await next.build()
    if (await gate((c) => c.futureCompat)) {
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain("code: 'DEP0144'")
      expect(cliOutput).toContain('at requireFromString')
      return
    }

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
        `export const unstable_paramMatching = { lang: 'blocking' } as const\n${await next.readFile(file)}`
      )
    }

    const { exitCode, cliOutput } = await next.build()
    if (await gate((c) => c.futureCompat)) {
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain("code: 'DEP0144'")
      expect(cliOutput).toContain('at requireFromString')
      return
    }
    expect(cliOutput).not.toContain(
      'conflicting parallel parameter matching modes'
    )
    expect(exitCode).toBe(0)
  })
})
