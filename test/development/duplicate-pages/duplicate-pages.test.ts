import { nextTestSetup } from 'e2e-utils'

describe('Handles Duplicate Pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  it('Shows warning in development', async () => {
    await next.render('/hello')
    expect(next.cliOutput).toMatch(/Duplicate page detected/)
  })
})
