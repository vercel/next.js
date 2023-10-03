import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - validation',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should error when passing invalid router state tree', async () => {
      const res = await next.fetch('/', {
        headers: {
          RSC: '1',
          'Next-Router-State-Tree': JSON.stringify(['', '']),
        },
      })
      expect(res.status).toBe(500)

      const res2 = await next.fetch('/', {
        headers: {
          RSC: '1',
          'Next-Router-State-Tree': JSON.stringify(['', {}]),
        },
      })
      expect(res2.status).toBe(200)
    })
  }
)
