import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'

// A route handler runs on the app-route runtime. The app-page runtime, which
// has the React renderers and everything else that only a page needs, is
// several times larger and expensive to load on a cold start. In a route
// handler `react` is the React inside the app-page runtime, so a Next.js
// module that loads `react` when it is imported loads all of it. None of these
// APIs needs React in a route handler.
//
// Each API has its own route handler in `app/api/<name>/route.ts`, so that it
// runs in a process that has loaded nothing else. To cover another API, add a
// route handler and its name here.
const APIS = [
  // next/headers
  'cookies',
  'headers',
  'draft-mode',
  // next/server
  'next-response',
  'next-request',
  'after',
  'connection',
  'user-agent',
  // next/navigation
  'redirect',
  'permanent-redirect',
  'not-found',
  // next/cache
  'revalidate-path',
  'revalidate-tag',
  'unstable-cache',
]

describe('route-handler-no-page-runtime', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.build()
  })

  async function getLoadedPageRuntime(api: string): Promise<string[]> {
    const { stdout } = await execa(
      process.execPath,
      ['invoke-route-handler.js', `/api/${api}`],
      { cwd: next.testDir, stderr: 'inherit' }
    )
    return JSON.parse(stdout.trim().split('\n').pop()!).loadedPageRuntime
  }

  it('should load the app-page runtime in a route handler that imports React', async () => {
    // If the app-page runtime is renamed or loaded in another way, the checks
    // below would pass for the wrong reason.
    expect(await getLoadedPageRuntime('react')).not.toEqual([])
  })

  it.each(APIS)(
    'should not load the app-page runtime in a route handler that uses %s',
    async (api) => {
      expect(await getLoadedPageRuntime(api)).toEqual([])
    }
  )
})
