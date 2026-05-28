import { nextTestSetup } from 'e2e-utils'

describe('Errors on output to static', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('Throws error when export out dir is static', async () => {
    await next.build()

    expect(next.cliOutput).toMatch(
      /The 'static' directory is reserved in Next\.js and can not be used as/
    )
  })
})
