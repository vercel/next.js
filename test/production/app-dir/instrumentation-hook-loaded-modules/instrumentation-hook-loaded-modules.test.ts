import { nextTestSetup } from 'e2e-utils'

// Every server process loads this module to look for the instrumentation file.
const INSTRUMENTATION_LOADER =
  'next/dist/server/lib/router-utils/instrumentation-globals.external.js'

// Extends the tracer provider that `register()` installed. Nothing else uses
// it, so it must only be loaded after `register()` ran.
const INSTRUMENTATION_EXTENSIONS =
  'next/dist/server/lib/router-utils/instrumentation-node-extensions.js'

describe('instrumentation-hook-loaded-modules', () => {
  describe('without an instrumentation file', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    beforeAll(async () => {
      await next.deleteFile('instrumentation.ts')
      await next.start()
    })

    it('should not load the instrumentation extensions', async () => {
      const res = await next.fetch('/api/loaded-modules')
      expect(res.status).toBe(200)
      const { registered, loaded } = await res.json()

      expect(registered).toBe(false)
      // If the loader is renamed or stops being a separate file, the check
      // below would pass for the wrong reason.
      expect(loaded).toContain(INSTRUMENTATION_LOADER)
      expect(loaded).not.toContain(INSTRUMENTATION_EXTENSIONS)
    })
  })

  describe('with an instrumentation file', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should call register() and load the instrumentation extensions', async () => {
      const res = await next.fetch('/api/loaded-modules')
      expect(res.status).toBe(200)
      const { registered, loaded } = await res.json()

      expect(registered).toBe(true)
      expect(loaded).toContain(INSTRUMENTATION_LOADER)
      expect(loaded).toContain(INSTRUMENTATION_EXTENSIONS)
    })
  })
})
