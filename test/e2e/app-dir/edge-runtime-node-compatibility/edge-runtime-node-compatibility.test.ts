import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'edge runtime node compatibility',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('supports node:buffer', async () => {
      const res = await next.fetch('/buffer', {
        method: 'POST',
        body: 'Hello, world!',
      })
      const json = await res.json()
      expect(json).toEqual({
        encoded: Buffer.from('Hello, world!').toString('base64'),
        exposedKeys: [
          'constants',
          'kMaxLength',
          'kStringMaxLength',
          'Buffer',
          'SlowBuffer',
          'default',
        ],
      })
    })
  }
)
