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

  it('writes complete static HTML for every generated path', async () => {
    for (let index = 1; index <= 12; index++) {
      const slug = `post-${index}`
      const html = await next.readFile(`.next/server/app/blog/${slug}.html`)

      expect(html).toContain(`<p id="content">content for ${slug}</p>`)
      expect(html).toContain('</html>')
    }
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
