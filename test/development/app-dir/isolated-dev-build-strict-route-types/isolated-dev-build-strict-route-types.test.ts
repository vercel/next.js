import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('isolated-dev-build with strictRouteTypes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should use fixed path in next-env.d.ts with strictRouteTypes enabled', async () => {
    await retry(async () => {
      // next-env.d.ts should use the fixed path .next/types/routes.d.ts
      // not the dev-specific path .next/dev/types/routes.d.ts
      // even with strictRouteTypes enabled
      const nextEnvContent = await next.readFile('next-env.d.ts')
      expect(nextEnvContent).toContain('import "./.next/types/routes.d.ts"')
      expect(nextEnvContent).not.toContain('.next/dev/types')

      // With strictRouteTypes enabled, next-env.d.ts should NOT have
      // additional imports for cache-life, validator, link
      // These are now re-exported from the entry file
      expect(nextEnvContent).not.toContain('cache-life')
      expect(nextEnvContent).not.toContain('validator')
      expect(nextEnvContent).not.toContain('link.d.ts')
    })
  })

  it('should create entry file that re-exports strict route type files', async () => {
    await retry(async () => {
      // The entry file should exist at the fixed path
      expect(await next.hasFile('.next/types/routes.d.ts')).toBe(true)

      // The entry file should reference the actual types in .next/dev/types
      const entryFileContent = await next.readFile('.next/types/routes.d.ts')
      expect(entryFileContent).toContain('route-types.d.ts')
      expect(entryFileContent).toContain('../dev/types/')

      // With strictRouteTypes enabled, entry file should also reference
      // cache-life.d.ts and validator.ts
      expect(entryFileContent).toContain('cache-life.d.ts')
      expect(entryFileContent).toContain('validator.ts')
    })
  })

  it('should create strict route type files in .next/dev/types/', async () => {
    await retry(async () => {
      // Actual type files should be in .next/dev/types/
      expect(await next.hasFile('.next/dev/types/route-types.d.ts')).toBe(true)
      expect(await next.hasFile('.next/dev/types/cache-life.d.ts')).toBe(true)
      expect(await next.hasFile('.next/dev/types/validator.ts')).toBe(true)
    })
  })
})
