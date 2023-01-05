import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'createNextDescribe',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work', async () => {
      const res = await next.fetch('/')
      expect(await res.text()).toContain('Hello World')
    })
  }
)
