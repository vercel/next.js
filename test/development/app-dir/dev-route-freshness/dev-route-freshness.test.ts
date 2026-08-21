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
// A request made before the operating system has delivered the change event
// to the watcher cannot see the new file. With many directories watched,
// delivery can take a few tens of milliseconds, so requests for an added page
// start later.
const ADDED_DELAYS_MS = [60, 120, 250, 500]
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

describe('dev-route-freshness in a large app', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // Rebuilding the route tables takes longer the more routes there are, so a
  // request has more time to arrive while the watcher is still at it.
  beforeAll(async () => {
    for (let i = 0; i < 1500; i++) {
      const dir = path.join(next.testDir, `app/section-${i % 30}/page-${i}`)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'page.tsx'),
        `export default function Page() { return <p>page-${i}</p> }`
      )
    }
    await next.start()
    // Let the watcher finish taking in the tree before measuring.
    await retry(async () => {
      expect((await next.fetch('/section-29/page-1499')).status).toBe(200)
    }, 15_000)
    await waitFor(1000)
  })

  it('responds 200 to a request made right after a page is added', async () => {
    const failures: string[] = []
    for (let i = 0; i < ITERATIONS; i++) {
      const pathname = `/added-${i}`
      const dir = path.join(next.testDir, `app/added-${i}`)
      await fs.mkdir(dir, { recursive: true })
      // Creating the directory is itself a change the watcher reacts to.
      await waitFor(300)

      const delay = ADDED_DELAYS_MS[i % ADDED_DELAYS_MS.length]
      await fs.writeFile(
        path.join(dir, 'page.tsx'),
        `export default function Page() { return <p>${pathname}</p> }`
      )
      await waitFor(delay)
      const res = await next.fetch(pathname)
      if (res.status !== 200) {
        failures.push(`${pathname} after ${delay}ms: ${res.status}`)
      }
      await retry(async () => {
        expect((await next.fetch(pathname)).status).toBe(200)
      }, 15_000)
    }
    expect(failures).toEqual([])
  })

  it('responds 200 to a request for a page added among many others', async () => {
    const count = 40
    const dirs = Array.from({ length: count }, (_, i) =>
      path.join(next.testDir, `app/burst-${i}`)
    )
    await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })))
    await waitFor(300)

    await Promise.all(
      dirs.map((dir, i) =>
        fs.writeFile(
          path.join(dir, 'page.tsx'),
          `export default function Page() { return <p>/burst-${i}</p> }`
        )
      )
    )
    // Each directory has its own watcher, so the events for a burst of files
    // are spread out more than the event for a single file.
    await waitFor(100)
    const res = await next.fetch(`/burst-${count - 1}`)
    expect(res.status).toBe(200)
  })
})
