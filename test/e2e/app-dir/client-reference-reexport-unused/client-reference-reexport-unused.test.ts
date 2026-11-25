import { nextTestSetup } from 'e2e-utils'

describe('client-reference-reexport-unused', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'test-pkg': 'file:./test-pkg',
    },
  })

  it('builds and serves a page re-exported from a side-effect-free package', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<html')
  })
})
