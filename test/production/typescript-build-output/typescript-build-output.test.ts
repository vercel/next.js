import { nextTestSetup } from 'e2e-utils'

describe('typescript-build-output', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should show "Finished TypeScript" message in build output', async () => {
    await next.build()
    expect(next.cliOutput).toContain('Finished TypeScript')
  })
})
