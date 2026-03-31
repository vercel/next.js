import { nextTestSetup } from 'e2e-utils'

describe('build-output-ssg-bailout', () => {
  if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
    it.skip('PPR is enabled, will throw instead of bailing out', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      __NEXT_PRIVATE_DETERMINISTIC_BUILD_OUTPUT: '1',
      NEXT_DEBUG_BUILD: '1',
    },
  })

  beforeAll(() => next.build())

  // This is available when NEXT_DEBUG_BUILD is set (or --debug flag is used).
  it('should show error messages for SSG bailout', async () => {
    expect(next.cliOutput).toContain(
      'Error: Static generation failed due to dynamic usage on /ssg-bailout/1, reason: `await searchParams`, `searchParams.then`, or similar'
    )
    expect(next.cliOutput).toContain(
      'Error: Static generation failed due to dynamic usage on /ssg-bailout/2, reason: `await searchParams`, `searchParams.then`, or similar'
    )
    expect(next.cliOutput).toContain(
      'Error: Static generation failed due to dynamic usage on /ssg-bailout/3, reason: `await searchParams`, `searchParams.then`, or similar'
    )

    // Bailed out for /ssg-bailout-partial/1 only.
    expect(next.cliOutput).toContain(
      'Error: Static generation failed due to dynamic usage on /ssg-bailout-partial/1, reason: `await searchParams`, `searchParams.then`, or similar'
    )
  })

  it('should list SSG pages for pages that did not bail out', async () => {
    // - /ssg/[id] is marked (SSG) and has 1,2,3 listed.
    // - /ssg-bailout-partial/[id] is marked (SSG) and has 2,3 listed.
    // - /ssg-bailout/[id] is marked (Dynamic) and has nothing listed.
    expect(getTreeView(next.cliOutput)).toMatchInlineSnapshot(`
     "Route (app)
     ┌ ○ /_not-found
     ├ ƒ /ssg-bailout-partial/[id]
     ├ ● /ssg-bailout-partial/[id]
     │ ├ /ssg-bailout-partial/2
     │ └ /ssg-bailout-partial/3
     ├ ƒ /ssg-bailout/[id]
     └ ● /ssg/[id]
       ├ /ssg/1
       ├ /ssg/2
       └ /ssg/3


     ○  (Static)   prerendered as static content
     ●  (SSG)      prerendered as static HTML (uses generateStaticParams)
     ƒ  (Dynamic)  server-rendered on demand"
    `)
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
