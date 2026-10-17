import { nextTestSetup, type NextInstance } from 'e2e-utils'
import { cp, rm } from 'node:fs/promises'
import { join } from 'node:path'

// Deploy tools that sync a new build over the server's `.next` keep the files
// the server wrote at runtime. The new build must not serve those responses.
async function expectNewBuildAfterSync(
  next: NextInstance,
  env?: Record<string, string>
) {
  const v1 = await next.render$('/')
  expect(v1('#build').text()).toBe('v1')

  await next.stop()
  const routeCache = join(next.testDir, '.next/server/route-cache')
  const kept = join(next.testDir, 'kept-route-cache')
  await cp(routeCache, kept, { recursive: true })

  await next.patchFile('app/build.ts', `export const build = 'v2'\n`)
  expect((await next.build({ env })).exitCode).toBe(0)
  await cp(kept, routeCache, { recursive: true })
  await rm(kept, { recursive: true })
  await next.start({ skipBuild: true, env })

  const v2 = await next.render$('/')
  expect(v2('#build').text()).toBe('v2')
  const scripts = v2('script[src]')
    .map((_, script) => v2(script).attr('src'))
    .get()
  expect(scripts.length).toBeGreaterThan(0)
  for (const src of scripts) {
    expect((await next.fetch(src)).status).toBe(200)
  }
}

describe('route-cache-in-place-deploy', () => {
  describe('with a generated build ID', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      disableAutoSkewProtection: true,
    })

    it('serves the new build after it is synced over a used .next', async () => {
      await expectNewBuildAfterSync(next)
    })
  })

  // A configured deployment ID replaces the build ID with a constant.
  describe('with a deployment ID', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      disableAutoSkewProtection: true,
      env: { NEXT_DEPLOYMENT_ID: 'dpl-1' },
    })

    it('serves the new deployment after it is synced over a used .next', async () => {
      await expectNewBuildAfterSync(next, { NEXT_DEPLOYMENT_ID: 'dpl-2' })
    })
  })
})
