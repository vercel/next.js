import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  '_allow-underscored-root-directory',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should not serve app path with underscore', async () => {
      const res = await next.fetch('/_handlers')
      expect(res.status).toBe(404)
    })

    it('should pages path with a underscore at the root', async () => {
      const res = await next.fetch('/')
      await expect(res.text()).resolves.toBe('Hello, world!')
    })

    it('should serve app path with %5F', async () => {
      const res = await next.fetch('/_routable-folder')
      await expect(res.text()).resolves.toBe('Hello, world!')
    })
  }
)
