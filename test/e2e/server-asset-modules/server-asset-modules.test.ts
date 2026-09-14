import { nextTestSetup } from 'e2e-utils'

describe('serverside asset modules', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should enable reading local files in api routes', async () => {
    const res = await next.fetch('/api/test')
    expect(res.status).toEqual(200)
    const content = await res.json()
    expect(content).toHaveProperty('message', 'hello world')
  })
})
