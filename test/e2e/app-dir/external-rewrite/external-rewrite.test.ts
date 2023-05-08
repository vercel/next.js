import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'external-rewrite',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work when using GET to an external url', async () => {
      const res = await next.fetch('/test', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const json = await res.json()

      expect(json.receivedMethod).toBe('GET')
    })
    it('should work when using POST to an external url', async () => {
      const res = await next.fetch('/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ a: 'a', b: 'b', c: 'c', d: 'd', e: 'e' }),
      })

      const json = await res.json()

      expect(json.receivedBody.a).toBe('a')
    })
  }
)
