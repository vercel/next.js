import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir metadata-json-manifest',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should support metadata.json manifest', async () => {
      const response = await next.fetch('/manifest.json')
      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json).toEqual({
        name: 'My Next.js Application',
        short_name: 'Next.js App',
        description: 'An application built with Next.js',
        start_url: '/',
      })
    })
  }
)
