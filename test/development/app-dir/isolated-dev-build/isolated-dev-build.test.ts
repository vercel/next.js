import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('isolated-dev-build', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should create dev artifacts in .next/dev/ directory', async () => {
    await retry(async () => {
      expect(await next.hasFile('.next/dev')).toBe(true)
      expect(await next.hasFile('.next/server')).toBe(false)
    })
  })

  it('should work with HMR', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    await next.patchFile('app/page.tsx', (content) => {
      return content.replace('hello world', 'hello updated world')
    })

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('hello updated world')
    })
  })

  it('should use fixed path in next-env.d.ts', async () => {
    await retry(async () => {
      // next-env.d.ts should use the fixed path .next/types/routes.d.ts
      // not the dev-specific path .next/dev/types/routes.d.ts
      const nextEnvContent = await next.readFile('next-env.d.ts')
      expect(nextEnvContent).toContain('import "./.next/types/routes.d.ts"')
      expect(nextEnvContent).not.toContain('.next/dev/types')
    })
  })

  it('should create entry file at .next/types/routes.d.ts that references dev types', async () => {
    await retry(async () => {
      // The entry file should exist at the fixed path
      expect(await next.hasFile('.next/types/routes.d.ts')).toBe(true)

      // The entry file should reference the actual types in .next/dev/types
      const entryFileContent = await next.readFile('.next/types/routes.d.ts')
      expect(entryFileContent).toContain('route-types.d.ts')
      expect(entryFileContent).toContain('../dev/types/')
    })
  })

  it('should create actual type files in .next/dev/types/', async () => {
    await retry(async () => {
      // Actual type files should be in .next/dev/types/
      expect(await next.hasFile('.next/dev/types/route-types.d.ts')).toBe(true)
    })
  })
})
