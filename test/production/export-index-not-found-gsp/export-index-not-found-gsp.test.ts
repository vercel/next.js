import { nextTestSetup } from 'e2e-utils'

describe('Export index page with `notFound: true` in `getStaticProps`', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should build successfully', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  })
})
