import { promises as fs } from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('new-route-first-request', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('responds 200 to the first request for a newly added page', async () => {
    expect((await next.fetch('/')).status).toBe(200)

    const failures: string[] = []
    for (let i = 0; i < 30; i++) {
      const pathname = `/added-${i}`
      // Write the file directly instead of using next.patchFile, which waits
      // 500ms after writes into app/ to let the watchers catch up. The first
      // request for the route has to race the watchers.
      const dir = path.join(next.testDir, `app/added-${i}`)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'page.tsx'),
        `export default function Page() { return <p>added-${i}</p> }`
      )
      // Make the first-ever request for the route at varying points of the
      // watchers' catch-up work, starting at "immediately".
      await waitFor((i % 5) * 15)
      const res = await next.fetch(pathname)
      if (res.status !== 200) {
        failures.push(`${pathname}: ${res.status}`)
      }
    }

    expect(failures).toEqual([])
  })

  it('still responds 404 for a route that does not exist', async () => {
    expect((await next.fetch('/does-not-exist')).status).toBe(404)
  })

  it('responds 404 (not 500) to the first request for a deleted page', async () => {
    const dir = path.join(next.testDir, 'app/removed')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'page.tsx'),
      'export default function Page() { return <p>removed</p> }'
    )
    await retry(async () => {
      expect((await next.fetch('/removed')).status).toBe(200)
    })

    for (let i = 0; i < 5; i++) {
      await fs.rm(dir, { recursive: true })
      // Start requesting at varying points of the watchers' catch-up work,
      // beginning at "immediately". The route may briefly keep serving while
      // the deletion propagates, but it must never error.
      await waitFor(i * 15)
      const statuses: number[] = []
      await retry(async () => {
        const res = await next.fetch('/removed')
        statuses.push(res.status)
        expect(res.status).toBe(404)
      })
      expect(
        statuses.filter((status) => status !== 200 && status !== 404)
      ).toEqual([])

      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(
        path.join(dir, 'page.tsx'),
        'export default function Page() { return <p>removed</p> }'
      )
      await retry(async () => {
        expect((await next.fetch('/removed')).status).toBe(200)
      })
    }
  })
})
