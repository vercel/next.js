import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('isolated-dev-build', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should create dev artifacts in .next/dev/ directory', async () => {
    expect(await next.hasFile('.next/dev')).toBe(true)
    expect(await next.hasFile('.next/server')).toBe(false)
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

  it('should use stable path in next-env.d.ts that does not change between dev/build', async () => {
    const nextEnvContent = await next.readFile('next-env.d.ts')
    // Snapshot ensures next-env.d.ts content stays stable
    expect(nextEnvContent).toMatchInlineSnapshot(`
      "/// <reference types="next" />
      /// <reference types="next/image-types/global" />
      import "./.next/types/routes.d.ts";

      // NOTE: This file should not be edited
      // see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
      "
    `)
  })

  it('should create proxy routes.d.ts at stable path that re-exports from dev types', async () => {
    // The proxy file should re-export from the dev types location
    const proxyContent = await next.readFile('.next/types/routes.d.ts')
    expect(proxyContent).toMatchInlineSnapshot(`
      "// This file re-exports route types from the dev types location.
      // This provides a stable import path for next-env.d.ts across dev/build modes.
      export * from '../dev/types/routes.d.ts';
      "
    `)

    // The actual dev types should exist
    expect(await next.hasFile('.next/dev/types/routes.d.ts')).toBe(true)
  })
})
