import { nextTestSetup } from 'e2e-utils'

describe('nextTestSetup', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work', async () => {
    const res = await next.fetch('/')
    expect(await res.text()).toContain('Hello World')
  })
})
