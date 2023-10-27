import { createNextDescribe } from 'e2e-utils'
import path from 'path'

createNextDescribe(
  'multi-zone',
  {
    files: path.join(__dirname, 'app'),
    skipDeployment: true,
    buildCommand: 'pnpm build',
    startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
    packageJson: {
      scripts: {
        'post-build': 'echo done',
      },
    },
  },
  ({ next }) => {
    it.each([
      { pathname: '/first', content: ['hello from first app'] },
      { pathname: '/second', content: ['hello from second app'] },
      {
        pathname: '/first/blog/post-1',
        content: ['hello from first app /blog/[slug]'],
      },
      {
        pathname: '/second/blog/post-1',
        content: ['hello from second app /blog/[slug]'],
      },
      {
        pathname: '/second/another/post-1',
        content: ['hello from second app /another/[slug]'],
      },
    ])(
      'should correctly respond for $pathname',
      async ({ pathname, content }) => {
        const res = await next.fetch(pathname, {
          redirect: 'manual',
        })
        expect(res.status).toBe(200)

        const html = await res.text()

        for (const item of content) {
          expect(html).toContain(item)
        }
      }
    )
  }
)
