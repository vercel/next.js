import { createNextDescribe } from 'e2e-utils'

// x-ref: https://github.com/vercel/next.js/issues/57964
// x-ref: https://github.com/vercel/next.js/issues/58831
createNextDescribe(
  'app-dir - app bundle error bug',
  {
    files: __dirname,
    dependencies: {
      '@mux/mux-video-react': '0.8.0',
      '@pathfinder-ide/react': '0.3.1',
    },
  },
  ({ next }) => {
    it('should not error with dynamic import with @pathfinder-ide/react in client component', async () => {
      const { status } = await next.fetch('/client')
      expect(status).toBe(200)
    })

    it('should not error with dynamic import with @mux/mux-video-react in server component', async () => {
      const { status } = await next.fetch('/server')
      expect(status).toBe(200)
    })
  }
)
