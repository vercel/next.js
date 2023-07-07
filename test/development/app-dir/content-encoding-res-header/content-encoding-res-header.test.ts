import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'content-encoding-res-header',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should not return content-encoding reponse header for decompressed resposne (api)', async () => {
      const res = await next.fetch('/api', {
        method: 'GET',
        headers: {
          'accept-encoding': 'identity',
        },
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('x-original-content-encoding')).toBe('null')
      expect(res.headers.has('content-encoding')).toBe(false)
    })

    it('should not return content-encoding reponse header for decompressed resposne (static)', async () => {
      const res = await next.fetch('/static', {
        method: 'GET',
        headers: {
          'accept-encoding': 'identity',
        },
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('x-original-content-encoding')).toBe('null')
      expect(res.headers.has('content-encoding')).toBe(false)
    })
  }
)
