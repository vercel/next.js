import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir revalidate',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should be able to revalidate the cache via pages/api', async () => {
      const $ = await next.render$('/')
      const id = $('h1').text()
      const res = await next.fetch('/api/revalidate')
      expect(res.status).toBe(200)
      const $2 = await next.render$('/')
      const id2 = $2('h1').text()
      expect(id).not.toBe(id2)
    })
  }
)
