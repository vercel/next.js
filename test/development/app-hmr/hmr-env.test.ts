import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

const envFile = '.env.development.local'

describe(`app-dir hmr-env`, () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    patchFileDelay: 1000,
  })

  it.each(['node', 'node-module-var', 'edge', 'edge-module-var'])(
    'should update server components pages when env files is changed (%s)',
    async (page) => {
      const browser = await next.browser(`/env/${page}`)
      expect(await browser.elementByCss('p').text()).toBe('mac')

      await next.patchFile(envFile, 'MY_DEVICE="ipad"', async () => {
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('ipad')
        })
      })

      // ensure it's restored back to "mac" before the next test
      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe('mac')
      })

      expect(next.cliOutput).not.toContain('FATAL')
    }
  )

  it('invalidates a deleted environment value instead of retaining the previous module value', async () => {
    const original = await next.readFile(envFile)
    try {
      await next.patchFile(
        'app/env/deleted/route.js',
        'export function GET() { return Response.json({ value: process.env.ROUTING_TEST_REMOVED_VALUE ?? null }) }'
      )
      await next.patchFile(
        envFile,
        original + '\nROUTING_TEST_REMOVED_VALUE=test-owned-value\n'
      )
      await retry(async () => {
        expect(await (await next.fetch('/env/deleted')).json()).toEqual({
          value: 'test-owned-value',
        })
      })
      await next.patchFile(envFile, original)
      await retry(async () => {
        expect(await (await next.fetch('/env/deleted')).json()).toEqual({
          value: null,
        })
      })
    } finally {
      await next.patchFile(envFile, original)
      await next.deleteFile('app/env/deleted/route.js')
    }
  })
})
