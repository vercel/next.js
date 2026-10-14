import { promises as fs } from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

// The file watcher takes a moment to notice a change, and the dev server
// serves from what the watcher last told it. These tests make the first
// request for a route at varying delays after the filesystem changed, so that
// some of them arrive before the watcher has caught up. Files are written
// directly: next.patchFile waits after writing into app/, which would hide
// exactly that window.
const DELAYS_MS = [0, 15, 30, 60]
const ITERATIONS = 20

describe('dev-route-freshness', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('responds 404 to a request made right after a page is deleted', async () => {
    const failures: string[] = []
    for (let i = 0; i < ITERATIONS; i++) {
      const pathname = `/deleted-${i}`
      const dir = path.join(next.testDir, `app/deleted-${i}`)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'page.tsx'),
        `export default function Page() { return <p>${pathname}</p> }`
      )
      await retry(async () => {
        expect((await next.fetch(pathname)).status).toBe(200)
      }, 15_000)

      const delay = DELAYS_MS[i % DELAYS_MS.length]
      await fs.rm(dir, { recursive: true, force: true })
      await waitFor(delay)
      const res = await next.fetch(pathname)
      if (res.status !== 404) {
        failures.push(`${pathname} after ${delay}ms: ${res.status}`)
      }
      await retry(async () => {
        expect((await next.fetch(pathname)).status).toBe(404)
      }, 15_000)
    }
    expect(failures).toEqual([])
  })
})
