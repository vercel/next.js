import { nextTestSetup } from 'e2e-utils'

describe('dynamic-import-edge', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function get(path: string) {
    const res = await next.fetch(path)
    return res.json()
  }

  it('should import a module with a dynamic request', async () => {
    expect(await get('/api/import?name=a')).toEqual({
      name: 'a',
      default: 'default a',
    })
  })

  it('should import a CommonJS module with a dynamic request', async () => {
    expect(await get('/api/import?name=b')).toEqual({
      name: 'b',
      default: { name: 'b' },
    })
  })

  it('should reject a dynamic import that matches no module', async () => {
    expect(await get('/api/import?name=missing')).toEqual({
      error: expect.stringContaining('Cannot find module'),
    })
  })

  it('should require a module with a dynamic request', async () => {
    expect(await get('/api/require?name=b')).toEqual({ name: 'b' })
  })
})
