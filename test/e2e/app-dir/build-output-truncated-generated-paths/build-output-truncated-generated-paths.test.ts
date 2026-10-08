import { nextTestSetup } from 'e2e-utils'

// This suite only asserts `next build` output, so it is start-mode only.
// @force-gate start
describe('build output - truncated generated paths', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      __NEXT_PRIVATE_DETERMINISTIC_BUILD_OUTPUT: '1',
    },
  })

  beforeAll(() => next.build())

  it('marks the collapsed generated paths as static', async () => {
    expect(getTreeView(next.cliOutput)).toContain(
      `└   /blog/[...slug]
  ├ ◐ /blog/[...slug]
  ├ ○ /blog/post-1
  ├ ○ /blog/post-2
  └ ○ [+10 more paths]`
    )
  })

  it('prerenders all generated paths completely and statically', async () => {
    const prerenderManifest = JSON.parse(
      await next.readFile('.next/prerender-manifest.json')
    )

    const generatedPaths = Object.fromEntries(
      Object.entries<any>(prerenderManifest.routes)
        .filter(([route]) => route.startsWith('/blog/'))
        .map(([route, { response, compute }]) => [route, { response, compute }])
    )

    expect(generatedPaths).toEqual({
      '/blog/post-1': { response: 'complete', compute: 'static' },
      '/blog/post-2': { response: 'complete', compute: 'static' },
      '/blog/post-3': { response: 'complete', compute: 'static' },
      '/blog/post-4': { response: 'complete', compute: 'static' },
      '/blog/post-5': { response: 'complete', compute: 'static' },
      '/blog/post-6': { response: 'complete', compute: 'static' },
      '/blog/post-7': { response: 'complete', compute: 'static' },
      '/blog/post-8': { response: 'complete', compute: 'static' },
      '/blog/post-9': { response: 'complete', compute: 'static' },
      '/blog/post-10': { response: 'complete', compute: 'static' },
      '/blog/post-11': { response: 'complete', compute: 'static' },
      '/blog/post-12': { response: 'complete', compute: 'static' },
    })
  })
})

function getTreeView(cliOutput: string): string {
  let foundStart = false
  const lines: string[] = []

  for (const line of cliOutput.split('\n')) {
    foundStart ||= line.startsWith('Route ')

    if (foundStart) {
      lines.push(line)
    }
  }

  return lines.join('\n').trim()
}
