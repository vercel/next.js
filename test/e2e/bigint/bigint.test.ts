import { nextTestSetup } from 'e2e-utils'

describe('bigint API route support', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return 200', async () => {
    const res = await next.fetch('/api/bigint')
    expect(res.status).toEqual(200)
  })

  it('should return the BigInt result text', async () => {
    const res = await next.fetch('/api/bigint')
    expect(res.ok).toBe(true)
    const text = await res.text()
    expect(text).toEqual('3')
  })
})
