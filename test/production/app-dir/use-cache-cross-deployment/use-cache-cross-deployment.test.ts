import { nextTestSetup } from 'e2e-utils'

const isoDateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe.each(['NEXT_DEPLOYMENT_ID', 'BUILD_ID', 'default'])(
  'use-cache-cross-deployment with %s',
  (envKey) => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      disableAutoSkewProtection: true,
      skipStart: true,
    })

    if (skipped) return

    // In the future, this assertion can be relaxed to only prevent sharing if the implementation
    // changed.
    it('should not have the same cache key across deployments', async () => {
      async function execute(id: string) {
        await next.stop()
        if (envKey !== 'default') {
          next.env[envKey] = id
        }
        try {
          await next.start()
          let keyRoot: string, keyPrerender: string

          {
            let match = next.cliOutput.match(
              /CustomCacheHandler::get \["([A-Za-z0-9_-]+)","([0-9a-f]{2})+",\[\{"id":"dynamic-cache"\}\]\] \[\["_N_T_\/layout","_N_T_\/prerender\/layout","_N_T_\/prerender\/page","_N_T_\/prerender"\]\]/
            )
            expect(match).toBeDefined()
            keyPrerender = match[0]
          }

          {
            let logs = next.getCliOutputFromHere()
            const browser = await next.browser(`/`)
            const initialData = await browser.elementById('data').text()
            expect(initialData).toMatch(isoDateRegExp)
            let match = logs().match(
              /CustomCacheHandler::get \["([A-Za-z0-9_-]+)","([0-9a-f]{2})+",\[\]\] \[\["_N_T_\/layout","_N_T_\/page","_N_T_\/","_N_T_\/index"\]\]/
            )
            expect(match).toBeDefined()
            keyRoot = match[0]
          }
          return { keyRoot, keyPrerender }
        } finally {
          if (envKey !== 'default') {
            delete next.env[envKey]
          }
        }
      }

      let key1 = await execute('value-1')
      let key2 = await execute('value-2')
      // Second run should not use the same key
      expect(key1.keyRoot).not.toBe(key2.keyRoot)
      expect(key1.keyPrerender).not.toBe(key2.keyPrerender)
    })
  }
)
