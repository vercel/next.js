import { nextBuild } from 'next-test-utils'

describe('import trace dynamic eval', () => {
  it("should show the user's import trace", async () => {
    const output = await nextBuild(__dirname, [], {
      stderr: true,
    })
    expect(output.code).toBe(1)
    expect(output.stderr).toMatchInlineSnapshot(`
      "
      > Build error occurred
      Error: > Couldn't find any \`pages\` or \`app\` directory. Please create one under the project root
          at findPagesDir (/home/balazs/projects/vercel/next.js/packages/next/dist/lib/find-pages-dir.js:42:15)
          at /home/balazs/projects/vercel/next.js/packages/next/dist/build/index.js:388:73
          at async Span.traceAsyncFn (/home/balazs/projects/vercel/next.js/packages/next/dist/trace/trace.js:151:20)
          at async build (/home/balazs/projects/vercel/next.js/packages/next/dist/build/index.js:350:9)
      "
    `)
  })
})
