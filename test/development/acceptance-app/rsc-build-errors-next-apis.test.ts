import { createSandbox } from 'development-sandbox'
import { runRscBuildErrorsTests } from './rsc-build-errors.util'

runRscBuildErrorsTests(({ next, isTurbopack, isRspack }) => {
  describe("importing 'next/cache' APIs in a client component", () => {
    test.each(['revalidatePath', 'revalidateTag', 'cacheLife', 'cacheTag'])(
      '%s is not allowed',
      async (api) => {
        await using sandbox = await createSandbox(
          next,
          undefined,
          `/server-with-errors/next-cache-in-client/${api.toLowerCase()}`
        )
        const { session } = sandbox
        await session.waitForRedbox()
        expect(await session.getRedboxSource()).toInclude(
          `You're importing a module that depends on "${api}" into a React Client Component module. This API is only available in Server Components but one of its parents is marked with "use client", so this module is also a Client Component.`
        )
      }
    )

    test.each([
      'unstable_cache', // useless in client, but doesn't technically error
      'unstable_noStore', // no-op in client, but allowed for legacy reasons
    ])('%s is allowed', async (api) => {
      await using sandbox = await createSandbox(
        next,
        undefined,
        `/server-with-errors/next-cache-in-client/${api.toLowerCase()}`
      )
      const { session } = sandbox
      await session.waitForNoRedbox()
    })
  })

  describe('next/root-params', () => {
    it("importing a non-existent getter from 'next/root-params'", async () => {
      await using sandbox = await createSandbox(
        next,
        undefined,
        `/server-with-errors/next-root-params/without-flag`
      )
      const { session } = sandbox
      await session.waitForRedbox()
      if (isTurbopack) {
        expect(await session.getRedboxSource()).toInclude(
          `Export whatever doesn't exist in target module`
        )
      } else if (isRspack) {
        expect(await session.getRedboxDescription()).toInclude(
          `'whatever' is not exported from 'next/root-params'`
        )
      } else {
        expect(await session.getRedboxDescription()).toInclude(
          `whatever) is not a function`
        )
      }
    })

    it("importing 'next/root-params' in a client component", async () => {
      await using sandbox = await createSandbox(
        next,
        undefined,
        `/server-with-errors/next-root-params/in-client`
      )
      const { session } = sandbox
      await session.waitForRedbox()
      expect(await session.getRedboxSource()).toInclude(
        `You're importing a module that depends on "next/root-params" into a React Client Component module. This API is only available in Server Components but one of its parents is marked with "use client", so this module is also a Client Component.`
      )
    })

    it("importing 'next/root-params' in a client component in a way that bypasses import analysis", async () => {
      await using sandbox = await createSandbox(
        next,
        undefined,
        `/server-with-errors/next-root-params/in-client-await-import`
      )
      const { session } = sandbox
      await session.waitForRedbox()
      expect(await session.getRedboxSource()).toInclude(
        `'next/root-params' cannot be imported from a Client Component module. It should only be used from a Server Component.`
      )
    })
  })
})
