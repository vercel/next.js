import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'ipc-forbidden-headers',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should not error if expect header is included', async () => {
      let res = await next.fetch('/api/pages-api', {
        method: 'POST',
        headers: { expect: '100-continue' },
      })
      let text = await res.text()

      expect(text).toEqual('Hello, Next.js!')

      res = await next.fetch('/api/app-api', {
        method: 'POST',
        headers: {
          expect: '100-continue',
        },
      })
      text = await res.text()

      expect(text).toEqual('Hello, Next.js!')
      expect(next.cliOutput).not.toContain('UND_ERR_NOT_SUPPORTED')
    })

    it("should not error on content-length: 0 if request shouldn't contain a payload", async () => {
      let res = await next.fetch('/api/pages-api', {
        method: 'DELETE',
        headers: { 'content-length': '0' },
      })

      expect(res.status).toBe(200)

      res = await next.fetch('/api/app-api', {
        method: 'DELETE',
        headers: { 'content-length': '0' },
      })

      expect(res.status).toBe(200)
      expect(next.cliOutput).not.toContain(
        'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH'
      )
    })
  }
)
