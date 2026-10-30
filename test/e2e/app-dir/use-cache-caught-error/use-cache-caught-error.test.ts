import { nextTestSetup } from 'e2e-utils'

describe('use-cache-caught-error', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it.each(['static', 'runtime'])(
    'should cache the fallback for /%s when a cached function throws',
    async (id) => {
      const response = await next.fetch(`/${id}`)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('<p>fallback</p>')

      if (isNextStart) {
        const cachedResponse = await next.fetch(`/${id}`)
        expect(cachedResponse.headers.get('x-nextjs-cache')).toBe('HIT')
      }
    }
  )
})
