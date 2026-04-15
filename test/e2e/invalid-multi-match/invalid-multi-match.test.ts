import { nextTestSetup } from 'e2e-utils'

describe('Custom routes invalid multi-match', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show error for invalid multi-match', async () => {
    await next.render('/random')
    expect(next.cliOutput).toContain(
      'To use a multi-match in the destination you must add'
    )
    expect(next.cliOutput).toContain(
      'https://nextjs.org/docs/messages/invalid-multi-match'
    )
  })
})
