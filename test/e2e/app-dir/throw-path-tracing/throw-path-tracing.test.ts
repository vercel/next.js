import path from 'node:path'
import { nextTestSetup } from 'e2e-utils'

describe('throw-path-tracing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('reads content through a helper that returns a directory or throws', async () => {
    const response = await next.fetch('/content/hello')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('Hello from the content directory.\n')
  })

  // Only a local production build exposes the route's file trace.
  // @force-gate start
  it('does not trace paths from an impossible undefined return', async () => {
    const traceDirectory = path.join(
      next.testDir,
      '.next/server/app/content/[slug]'
    )
    const trace = await next.readJSON(
      '.next/server/app/content/[slug]/route.js.nft.json'
    )
    const files = trace.files.map((file: string) =>
      path
        .relative(next.testDir, path.resolve(traceDirectory, file))
        .replaceAll(path.sep, '/')
    )

    expect(files).toContain('content/hello.mdx')
    // A return-or-throw helper never returns undefined. Stringifying that
    // impossible alternative must not trace this otherwise unreferenced file.
    expect(files).not.toContain('undefined/unreachable.mdx')
  })
})
