import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs'
import path from 'path'

describe('app-dir watch-distdir-deletion', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
  })

  it('should restart the server when distDir is deleted', async () => {
    // Wait for the dev server to be ready
    await retry(async () => {
      expect(next.cliOutput).toMatch(/ready/i)
    })

    // Make a request first to ensure the dev server has compiled
    const warmupRes = await next.fetch('/')
    expect(warmupRes.status).toBe(200)

    // Delete .next (which also removes .next/dev, the watched distDir). The dev
    // server may still be flushing manifests into .next/dev from the warmup
    // compilation, and those writes race the recursive delete: fs.rm unlinks
    // the directory's contents and then rmdir's it, but a file written
    // concurrently makes the rmdir throw ENOTEMPTY. maxRetries makes this
    // single delete resilient to that brief window by re-attempting the failed
    // rmdir until the flush settles. force ignores entries an earlier attempt
    // already removed.
    await fs.promises.rm(path.join(next.testDir, '.next'), {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    })

    // Wait for restart message and server to come back up
    await retry(
      async () => {
        expect(next.cliOutput).toMatch(/The directory at .* was deleted/)
      },
      30_000,
      1000
    )

    // Server should come back up and serve pages
    await retry(
      async () => {
        const res = await next.fetch('/')
        expect(res.status).toBe(200)
      },
      30_000,
      1000
    )
  })
})
