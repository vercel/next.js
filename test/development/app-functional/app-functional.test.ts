import { nextTestSetup } from 'e2e-utils'

describe('Document and App', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not have any missing key warnings', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/<div>Hello World!!!<\/div>/)
  })
})
