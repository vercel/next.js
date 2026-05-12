import { nextTestSetup } from 'e2e-utils'

describe('getServerSideProps', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should show error for GSSP during export', async () => {
    const { exitCode } = await next.build()

    expect(exitCode).toBe(1)
    expect(next.cliOutput).toMatch(
      /pages with `getServerSideProps` can not be exported\. See more info here: https/
    )
  })
})
