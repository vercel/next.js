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

  it.each([
    { router: 'app', path: '/app', expectedText: 'app page' },
    { router: 'pages', path: '/pages', expectedText: 'pages page' },
  ])(
    'should recover after .next is deleted ($router router)',
    async ({ path: routePath, expectedText }) => {
      // Verify route loads correctly before deletion
      await retry(async () => {
        const res = await next.fetch(routePath)
        expect(res.status).toBe(200)
        expect(await res.text()).toContain(expectedText)
      }, 30000)

      // Delete the .next directory while dev server is running
      await next.deleteFile('.next')

      // Wait for the dev server to detect the deletion and restart
      await retry(async () => {
        const cliOutput = next.cliOutput
        expect(cliOutput).toContain(
          'The .next directory was removed while the dev server was running. Restarting...'
        )
        expect(cliOutput).toContain('Ready in')
      }, 30000)

      // After restart, pages should render normally
      await retry(async () => {
        const res = await next.fetch(routePath)
        expect(res.status).toBe(200)
        expect(await res.text()).toContain(expectedText)
      }, 30000)
    }
  )
})
