import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

const inventoryPauseFile = path.join(
  os.tmpdir(),
  `next-route-initial-inventory-${process.pid}`
)

describe('dev-route-generation-state', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      NEXT_TEST_DEV_ROUTE_INITIAL_INVENTORY_PAUSE_FILE: inventoryPauseFile,
      NEXT_TEST_DEV_ROUTE_INITIAL_INVENTORY_CAPTURE_PATH:
        'app/during-start/route.ts',
    },
  })

  beforeAll(async () => {
    const claimedPauseFile = `${inventoryPauseFile}.claimed`
    await fs.writeFile(inventoryPauseFile, '')
    const startPromise = next.start()
    try {
      await retry(async () => {
        expect(next.cliOutput).toContain(
          '[next-test] initial dev route inventory paused'
        )
      }, 15_000)
      const routeFile = path.join(next.testDir, 'app/during-start/route.ts')
      await fs.mkdir(path.dirname(routeFile), { recursive: true })
      await fs.writeFile(
        routeFile,
        `export function GET() { return new Response('during start') }`
      )
      await retry(async () => {
        expect(next.cliOutput).toContain(
          '[next-test] dev route change observed during inventory'
        )
      }, 15_000)
    } finally {
      await Promise.all([
        fs.rm(inventoryPauseFile, { force: true }),
        fs.rm(claimedPauseFile, { force: true }),
      ])
    }
    await startPromise
  })

  it('removes generated interception rewrites with their route', async () => {
    await retry(async () => {
      const startupResponse = await next.fetch('/during-start')
      expect(startupResponse.status).toBe(200)
      expect(await startupResponse.text()).toBe('during start')
    }, 15_000)

    const headers = { rsc: '1', 'next-url': '/' }
    const intercepted = await next.fetch('/feed', { headers })
    expect(intercepted.status).toBe(200)
    expect(await intercepted.text()).toContain('intercepted feed')

    await next.deleteFile('app/@modal/(.)feed/page.tsx')

    await retry(async () => {
      const direct = await next.fetch('/feed', { headers })
      const directBody = await direct.text()
      expect(direct.status).toBe(200)
      expect(directBody).toContain('direct feed')
      expect(directBody).not.toContain('intercepted feed')
    }, 15_000)
  })

  it('removes retained routes when their directory is deleted', async () => {
    const route = await next.fetch('/remove-directory/nested')
    expect(route.status).toBe(200)
    expect(await route.text()).toBe('nested route')
    expect((await next.fetch('/remove-directory/conflict.txt')).status).toBe(
      500
    )

    await fs.rm(path.join(next.testDir, 'app/remove-directory'), {
      recursive: true,
      force: true,
    })

    await retry(async () => {
      expect((await next.fetch('/remove-directory/nested')).status).toBe(404)
      const publicFile = await next.fetch('/remove-directory/conflict.txt')
      expect(publicFile.status).toBe(200)
      expect(await publicFile.text()).toBe('public file\n')
    }, 15_000)
  })
})
