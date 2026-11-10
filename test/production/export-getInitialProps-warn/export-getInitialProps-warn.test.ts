import { nextTestSetup } from 'e2e-utils'

describe('Export with getInitialProps', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should show warning with next export', async () => {
    await next.build()
    expect(next.cliOutput).toContain(
      'https://nextjs.org/docs/messages/get-initial-props-export'
    )
  })
})
