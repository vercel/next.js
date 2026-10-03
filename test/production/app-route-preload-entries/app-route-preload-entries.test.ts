import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-route-preload-entries', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  it('evaluates route handler modules on start, before the first request', async () => {
    const markerPath = path.join(next.testDir, 'preload-marker.json')

    // Wait for the running server to have evaluated the route handler's
    // module on its own, without ever requesting the route.
    await retry(() => {
      expect(fs.existsSync(markerPath)).toBe(true)
    })

    const res = await next.fetch('/api/preload')
    expect(await res.json()).toEqual({ ok: true })
  })
})
