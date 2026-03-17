import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('cache-components - not-found race condition', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  it('should not reuse an in-flight notFound() cache entry across concurrent requests', async () => {
    // 1. Arm barrier so we can hold A inside the cached function body
    await next.fetch('/cases/not-found-race/barrier?action=arm')

    // 2. Start Request A: will call notFound() inside getCachedItem once released
    const missingReq = next.fetch('/cases/not-found-race/trigger-not-found')

    // 3. Wait until A has entered the cached function body and is blocking on the barrier.
    //    At this point an in-flight cache population exists for the shared key.
    await retry(async () => {
      const res = await next.fetch(
        '/cases/not-found-race/barrier?action=status'
      )
      const { enteredCount } = await res.json()
      expect(enteredCount).toBeGreaterThan(0)
    })

    // 4. Start Request B: same key → expected to observe the in-flight population
    const validReq = next.fetch('/cases/not-found-race/valid')

    // 5. Give B time to start awaiting the in-flight entry.
    //    If this proves flaky, add a pendingObservedCount to the barrier state.
    await new Promise((r) => setTimeout(r, 100))

    // 6. Release barrier: A proceeds → notFound() → in-flight resolves with poisoned entry
    await next.fetch('/cases/not-found-race/barrier?action=release')

    const [missingRes, validRes] = await Promise.all([missingReq, validReq])

    // A triggered notFound() → 404
    expect(missingRes.status).toBe(404)

    // B should get 200 (not poisoned). With the bug this will be 404.
    expect(validRes.status).toBe(200)
    const validHtml = await validRes.text()
    expect(validHtml).toContain('id="content"')
    expect(validHtml).toContain('item-content')

    // Follow-up requests must also not be poisoned
    const followUpRes = await next.fetch('/cases/not-found-race/valid')
    expect(followUpRes.status).toBe(200)
    const followUpHtml = await followUpRes.text()
    expect(followUpHtml).toContain('id="content"')
    expect(followUpHtml).toContain('item-content')
  })
})
