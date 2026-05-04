import { nextTestSetup } from 'e2e-utils'

const isoDateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe.each(['NEXT_DEPLOYMENT_ID', 'BUILD_ID', 'default'])(
  'use-cache-cross-deployment with %s',
  (envKey) => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      disableAutoSkewProtection: true,
      skipStart: true,
      // Skip deployment so we can test the custom cache handlers log output
      skipDeployment: true,
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
          let logs = next.getCliOutputFromHere()

          const browser = await next.browser(`/`)
          const initialData = await browser.elementById('data').text()
          expect(initialData).toMatch(isoDateRegExp)

          let match = logs().match(
            /ModernCustomCacheHandler::get \["([A-Za-z0-9_-]+)","([0-9a-f]{2})+",\[\]\] \[ '_N_T_\/layout', '_N_T_\/page', '_N_T_\/', '_N_T_\/index' \]/
          )
          expect(match).toBeDefined()
          return match[0]
        } finally {
          if (envKey !== 'default') {
            delete next.env[envKey]
          }
        }
      }

      let key1 = await execute('value-1')
      let key2 = await execute('value-2')
      // Second run should not use the same key
      expect(key1).not.toBe(key2)
    })
  }
)
