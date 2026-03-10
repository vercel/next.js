import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('delete-dot-next-dir', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      // Enable filesystem cache even when the git repo is dirty
      TURBO_ENGINE_IGNORE_DIRTY: '1',
    },
  })

  beforeEach(async () => {
    await next.start()
  })

  afterEach(async () => {
    await next.stop()
    await next.clean()
  })

  it('should recover after .next is deleted (app router)', async () => {
    // 1. Verify app route loads correctly before deletion
    await retry(async () => {
      const res = await next.fetch('/app')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('app page')
    }, 30000)

    // 2. Delete the .next directory while dev server is running
    await next.deleteFile('.next')

    // 3. Fetch a page — this triggers error detection and restart
    await next.fetch('/app/other').catch(() => {})

    // 4. Wait for the dev server to restart and become ready
    await retry(async () => {
      const cliOutput = next.cliOutput
      expect(cliOutput).toContain(
        'The .next directory was removed while the dev server was running. Restarting...'
      )
      expect(cliOutput).toContain('Ready in')
    }, 30000)

    // 5. After restart, pages should render normally
    await retry(async () => {
      const res = await next.fetch('/app')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('app page')
    }, 30000)
  })

  it('should recover after .next is deleted (pages router)', async () => {
    // 1. Verify pages route loads correctly before deletion
    await retry(async () => {
      const res = await next.fetch('/pages')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('pages page')
    }, 30000)

    // 2. Delete the .next directory while dev server is running
    await next.deleteFile('.next')

    // 3. Fetch a page — this triggers error detection and restart
    await next.fetch('/pages/other').catch(() => {})

    // 4. Wait for the dev server to restart and become ready
    await retry(async () => {
      const cliOutput = next.cliOutput
      expect(cliOutput).toContain(
        'The .next directory was removed while the dev server was running. Restarting...'
      )
      expect(cliOutput).toContain('Ready in')
    }, 30000)

    // 5. After restart, pages should render normally
    await retry(async () => {
      const res = await next.fetch('/pages')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('pages page')
    }, 30000)
  })
})
